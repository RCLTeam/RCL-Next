import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import { DiscordOAuthClient } from '../../apps/api/src/modules/auth/discord.client.js';
import { PostgresAuthRepository } from '../../apps/api/src/modules/auth/postgres-auth.repository.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import { PostgresCrudOperationsRepository } from '../../apps/api/src/modules/crud-operations/postgres-crud-operations.repository.js';
import { PostgresMemberRolesRepository } from '../../apps/api/src/modules/member-roles/postgres-member-roles.repository.js';
import * as schema from '../../packages/database/src/schema.js';

describe('member role authorization and persistence', () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const repository = new PostgresMemberRolesRepository(db);
  const origin = 'http://localhost:5173';
  const ids = {
    owner: '123456789012345678',
    admin: '223456789012345678',
    viewer: '323456789012345678'
  };
  const tokens = { owner: 'a'.repeat(64), admin: 'b'.repeat(64), viewer: 'c'.repeat(64) };
  const app = createApp({
    repository: new PostgresCompetitionRepository(db),
    crudOperationsRepository: new PostgresCrudOperationsRepository(db),
    memberRolesRepository: repository,
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
  const endpoint = '/api/v1/member-roles';
  const cookie = (role: keyof typeof tokens) => `rcl_session=${tokens[role]}`;
  const patch = (actor: keyof typeof tokens, target: string, body: object) =>
    request(app)
      .patch(`${endpoint}/${target}`)
      .set('Cookie', cookie(actor))
      .set('Origin', origin)
      .send(body);
  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
    for (const role of ['owner', 'admin', 'viewer'] as const) {
      await db.insert(schema.discordUsers).values({ discordId: ids[role], username: role, role });
      await db.insert(schema.authSessions).values({
        tokenHash: createHash('sha256').update(tokens[role]).digest('hex'),
        discordUserId: ids[role],
        expiresAt: new Date(Date.now() + 3600000)
      });
    }
  });
  afterAll(() => client.close());

  it('allows admin and owner reads, rejects viewers and anonymous clients', async () => {
    await request(app).get(endpoint).expect(401);
    await request(app).get(endpoint).set('Cookie', cookie('viewer')).expect(403);
    for (const role of ['admin', 'owner'] as const) {
      const result = await request(app).get(endpoint).set('Cookie', cookie(role)).expect(200);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.body.data.members).toHaveLength(3);
      expect(Object.keys(result.body.data.members[0]).sort()).toEqual([
        'discordId',
        'globalName',
        'role',
        'username'
      ]);
    }
    await request(app)
      .get('/api/v1/crud-operations/resources')
      .set('Cookie', cookie('owner'))
      .expect(200);
  });
  it('rejects forged role changes from admins and untrusted origins', async () => {
    await patch('admin', ids.admin, { role: 'owner', expectedRole: 'admin' }).expect(403);
    await patch('viewer', ids.viewer, { role: 'owner', expectedRole: 'viewer' }).expect(403);
    for (const source of ['', 'https://evil.example']) {
      await request(app)
        .patch(`${endpoint}/${ids.viewer}`)
        .set('Cookie', cookie('owner'))
        .set('Origin', source)
        .send({ role: 'admin', expectedRole: 'viewer' })
        .expect(403);
    }
    expect(await db.select().from(schema.auditLogs)).toHaveLength(0);
  });
  it('validates changes and prevents demoting the last owner', async () => {
    for (const body of [
      { role: 'superadmin', expectedRole: 'viewer' },
      { role: 'admin' },
      { role: 'admin', expectedRole: 'viewer', username: 'changed' }
    ]) {
      await patch('owner', ids.viewer, body).expect(422);
    }
    await patch('owner', '423456789012345678', { role: 'viewer', expectedRole: 'viewer' }).expect(
      404
    );
    const result = await patch('owner', ids.owner, { role: 'admin', expectedRole: 'owner' }).expect(
      409
    );
    expect(result.body.error.code).toBe('LAST_OWNER');
  });
  it('persists and audits changes, refreshes existing sessions, rejects stale edits', async () => {
    await patch('owner', ids.viewer, { role: 'admin', expectedRole: 'viewer' }).expect(200);
    const session = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie('viewer'))
      .expect(200);
    expect(session.body.data.role).toBe('admin');
    const stale = await patch('owner', ids.viewer, {
      role: 'owner',
      expectedRole: 'viewer'
    }).expect(409);
    expect(stale.body.error.code).toBe('ROLE_CHANGED');
    await patch('owner', ids.viewer, { role: 'admin', expectedRole: 'admin' }).expect(200);
    const audits = await db.select().from(schema.auditLogs);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorDiscordUserId: ids.owner,
      action: 'member-roles.update',
      before: { role: 'viewer' },
      after: { role: 'admin' }
    });
  });
  it('can transfer ownership and immediately removes role-write permission from the former owner', async () => {
    await patch('owner', ids.admin, { role: 'owner', expectedRole: 'admin' }).expect(200);
    await patch('owner', ids.owner, { role: 'admin', expectedRole: 'owner' }).expect(200);
    await patch('owner', ids.viewer, { role: 'viewer', expectedRole: 'admin' }).expect(403);
    await expect(
      repository.changeRole(ids.owner, ids.viewer, { role: 'viewer', expectedRole: 'admin' })
    ).rejects.toMatchObject({ status: 403 });
    await request(app).get(endpoint).set('Cookie', cookie('owner')).expect(200);
    await patch('admin', ids.admin, { role: 'viewer', expectedRole: 'owner' }).expect(409);
    await patch('admin', ids.viewer, { role: 'viewer', expectedRole: 'admin' }).expect(200);
    await request(app).get(endpoint).set('Cookie', cookie('viewer')).expect(403);
  });
  it('paginates and searches literal usernames and Discord IDs', async () => {
    await db.insert(schema.discordUsers).values(
      Array.from({ length: 51 }, (_, i) => ({
        discordId: String(500000000000000000n + BigInt(i)),
        username: `test_${String(i).padStart(2, '0')}`
      }))
    );
    const first = await repository.list('test_', 0);
    const second = await repository.list('test_', 50);
    expect(first.members).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(second.members).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect((await repository.list('%', 0)).members).toHaveLength(0);
    expect((await repository.list(ids.owner, 0)).members[0]?.discordId).toBe(ids.owner);
    await request(app).get(`${endpoint}?offset=-1`).set('Cookie', cookie('admin')).expect(422);
  });
});
