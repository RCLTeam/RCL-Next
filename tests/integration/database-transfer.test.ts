import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq, is, sql } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import { DiscordOAuthClient } from '../../apps/api/src/modules/auth/discord.client.js';
import { PostgresAuthRepository } from '../../apps/api/src/modules/auth/postgres-auth.repository.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import { PostgresDatabaseTransferRepository } from '../../apps/api/src/modules/database-transfer/postgres-database-transfer.repository.js';
import * as schema from '../../packages/database/src/schema.js';

describe('database transfer permissions and atomic restoration', () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const ids = {
    owner: '123456789012345678',
    admin: '223456789012345678',
    viewer: '323456789012345678'
  };
  const tokens = { owner: 'a'.repeat(64), admin: 'b'.repeat(64), viewer: 'c'.repeat(64) };
  const origin = 'http://localhost:5173';
  let dump = '';
  const tools = {
    exportDump: vi.fn(async () => Buffer.from('PGDMPtest')),
    readDump: vi.fn(async (buffer: Buffer) => ({
      data: buffer.toString(),
      exportedAt: '2026-09-21 12:00:00'
    }))
  };
  const repository = new PostgresDatabaseTransferRepository(db, tools);
  const app = createApp({
    repository: new PostgresCompetitionRepository(db),
    databaseTransferRepository: repository,
    checkDatabase: async () => {},
    corsOrigin: origin,
    auth: {
      service: new AuthService(
        new PostgresAuthRepository(db),
        new DiscordOAuthClient({
          clientId: ids.owner,
          clientSecret: 'test',
          redirectUri: `${origin}/callback`
        })
      ),
      secureCookies: false,
      frontendOrigin: origin
    }
  });
  const post = (path: string, role: keyof typeof ids = 'owner') =>
    request(app)
      .post(`/api/v1/database-transfer/${path}`)
      .set('Cookie', `rcl_session=${tokens[role]}`)
      .set('Origin', origin);
  const preview = (data = dump) =>
    post('import-preview').set('Content-Type', 'application/octet-stream').send(Buffer.from(data));
  const restore = (confirmation: string, data = dump) =>
    post('import')
      .set('Content-Type', 'application/octet-stream')
      .set('X-Import-Confirmation', confirmation)
      .send(Buffer.from(data));
  const encode = (value: unknown): string =>
    value === null
      ? '\\N'
      : String(typeof value === 'object' ? JSON.stringify(value) : value)
          .replaceAll('\\', '\\\\')
          .replaceAll('\n', '\\n')
          .replaceAll('\r', '\\r')
          .replaceAll('\t', '\\t');
  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
    for (const role of ['owner', 'admin', 'viewer'] as const) {
      await db.insert(schema.discordUsers).values({ discordId: ids[role], username: role, role });
      await db.insert(schema.authSessions).values({
        discordUserId: ids[role],
        tokenHash: createHash('sha256').update(tokens[role]).digest('hex'),
        expiresAt: new Date(Date.now() + 3600000)
      });
    }
    await db.insert(schema.seasons).values({ name: 'Backup season' });
    await db.insert(schema.auditLogs).values({
      actorDiscordUserId: ids.admin,
      action: 'test',
      entityType: 'test',
      after: { text: 'Tab\tLine\nUnicode ñ', nested: { value: null } }
    });
    for (const table of Object.values(schema)) {
      if (!is(table, PgTable)) continue;
      const config = getTableConfig(table);
      const columns = config.columns.map((column) => column.name);
      const rows = await db.execute<{ row: Record<string, unknown> }>(
        sql`SELECT to_jsonb(t) AS row FROM ${table} t`
      );
      dump += `COPY public.${config.name} (${columns.join(', ')}) FROM stdin;\n`;
      dump += rows.rows
        .map(({ row }) => columns.map((column) => encode(row[column])).join('\t'))
        .join('\n');
      dump += `${rows.rows.length ? '\n' : ''}\\.\n`;
    }
    const history = await db.execute<{ id: number; hash: string; created_at: string }>(
      sql`SELECT id, hash, created_at::text FROM drizzle.__drizzle_migrations`
    );
    dump += `COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;\n${history.rows.map((row) => `${row.id}\t${row.hash}\t${row.created_at}`).join('\n')}\n\\.\n`;
  });
  afterAll(() => client.close());
  it('exports native files for admins and owners only, requiring a trusted origin', async () => {
    for (const role of ['admin', 'owner'] as const) {
      const response = await post('export', role).expect(200);
      expect(response.headers['content-disposition']).toMatch(
        /attachment; filename="rcl-.+\.dump"/
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.toString()).toBe('PGDMPtest');
    }
    await post('export', 'viewer').expect(403);
    await request(app).post('/api/v1/database-transfer/export').set('Origin', origin).expect(401);
    await request(app)
      .post('/api/v1/database-transfer/export')
      .set('Cookie', `rcl_session=${tokens.admin}`)
      .expect(403);
  });
  it('rejects admin uploads before reading or restoring the backup', async () => {
    tools.readDump.mockClear();
    for (const path of ['import-preview', 'import'])
      await post(path, 'admin')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(dump))
        .expect(403);
    expect(tools.readDump).not.toHaveBeenCalled();
  });
  it('validates by restoring and rolling back, leaving rows and sessions intact', async () => {
    const response = await preview().expect(200);
    expect(response.body.data.tables).toHaveLength(19);
    expect(response.body.data.confirmation).toMatch(/^[a-f0-9]{64}$/);
    expect(await db.select().from(schema.authSessions)).toHaveLength(3);
    expect(await db.select().from(schema.auditLogs)).toHaveLength(1);
    expect((await db.select().from(schema.seasons))[0]?.name).toBe('Backup season');
  });
  it('rejects incompatible migrations, missing tables and invalid rows without changing data', async () => {
    await preview(dump.replace('COPY public.seasons', 'COPY public.unknown')).expect(422);
    await preview(
      dump.replace(/(COPY drizzle\.__drizzle_migrations[^\n]+\n\d+\t)[^\t]+/, '$1wrong-hash')
    ).expect(422);
    await preview(dump.replace('Backup season', 'x'.repeat(500))).expect(422);
    expect((await db.select().from(schema.seasons))[0]?.name).toBe('Backup season');
    expect(await db.select().from(schema.authSessions)).toHaveLength(3);
  });
  it('requires the reviewed file and unchanged database, and rechecks owner permission', async () => {
    const confirmation = (await preview().expect(200)).body.data.confirmation;
    await restore(confirmation, `${dump}\n-- changed file`).expect(409);
    await db.insert(schema.divisions).values({ name: 'Changed since preview' });
    await restore(confirmation).expect(409);
    await db
      .update(schema.discordUsers)
      .set({ role: 'admin' })
      .where(eq(schema.discordUsers.discordId, ids.owner));
    await restore(confirmation).expect(403);
    await expect(
      repository.importDatabase(Buffer.from(dump), confirmation, ids.owner)
    ).rejects.toMatchObject({ status: 403 });
    await db
      .update(schema.discordUsers)
      .set({ role: 'owner' })
      .where(eq(schema.discordUsers.discordId, ids.owner));
    await restore('not-a-confirmation').expect(422);
  });
  it('restores data atomically, preserves the importing owner and revokes sessions', async () => {
    const downgraded = dump.replace(/(123456789012345678\towner\t\\N\t\\N\t)owner/, '$1viewer');
    const content = `${downgraded}\nDROP TABLE public.seasons;\n\\! echo never-executed\n`;
    const confirmation = (await preview(content).expect(200)).body.data.confirmation;
    await restore(confirmation, content).expect(200);
    expect(await db.select().from(schema.divisions)).toHaveLength(0);
    expect((await db.select().from(schema.seasons))[0]?.name).toBe('Backup season');
    expect(
      (
        await db
          .select()
          .from(schema.discordUsers)
          .where(eq(schema.discordUsers.discordId, ids.owner))
      )[0]?.role
    ).toBe('owner');
    expect(await db.select().from(schema.authSessions)).toHaveLength(0);
    const logs = await db.select().from(schema.auditLogs);
    expect(logs).toHaveLength(2);
    expect(logs.find((log) => log.action === 'test')?.after).toEqual({
      text: 'Tab\tLine\nUnicode ñ',
      nested: { value: null }
    });
    expect(logs.find((log) => log.action === 'database-transfer.import')?.actorDiscordUserId).toBe(
      ids.owner
    );
    await post('export').expect(401);
  });
});
