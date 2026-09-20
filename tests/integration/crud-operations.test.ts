import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { CrudRecord } from '@rcl/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import { DiscordOAuthClient } from '../../apps/api/src/modules/auth/discord.client.js';
import { PostgresAuthRepository } from '../../apps/api/src/modules/auth/postgres-auth.repository.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import { crudResources } from '../../apps/api/src/modules/crud-operations/crud-operations.resources.js';
import { PostgresCrudOperationsRepository } from '../../apps/api/src/modules/crud-operations/postgres-crud-operations.repository.js';
import * as schema from '../../packages/database/src/schema.js';

describe('admin CRUD with HTTP sessions and PostgreSQL constraints', () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const origin = 'http://localhost:5173';
  const actorId = '123456789012345678';
  const memberId = '223456789012345678';
  const token = 'a'.repeat(64);
  const viewerToken = 'b'.repeat(64);
  const cookie = `rcl_session=${token}`;
  const competitionId = '10000000-0000-4000-8000-000000000001';
  const team1 = '20000000-0000-4000-8000-000000000001';
  const team2 = '20000000-0000-4000-8000-000000000002';
  const app = createApp({
    repository: new PostgresCompetitionRepository(db),
    crudOperationsRepository: new PostgresCrudOperationsRepository(db),
    checkDatabase: async () => {},
    corsOrigin: origin,
    auth: {
      service: new AuthService(
        new PostgresAuthRepository(db),
        new DiscordOAuthClient({
          clientId: actorId,
          clientSecret: 'test',
          redirectUri: `${origin}/callback`
        })
      ),
      secureCookies: false,
      frontendOrigin: origin
    }
  });
  const endpoint = (name: string) => `/api/v1/crud-operations/${name}`;
  const send = (method: 'post' | 'put' | 'delete', name: string, body: object) =>
    request(app)[method](endpoint(name)).set('Cookie', cookie).set('Origin', origin).send(body);
  function updateBody(name: string, record: CrudRecord, changes: CrudRecord = {}) {
    const resource = crudResources.find((item) => item.name === name);
    if (!resource) throw new Error('Missing resource');
    return {
      key: Object.fromEntries(resource.keys.map((key) => [key, record[key]])),
      version: record.updatedAt,
      values: {
        ...Object.fromEntries(resource.fields.map((field) => [field.name, record[field.name]])),
        ...changes
      }
    };
  }
  function deleteBody(name: string, record: CrudRecord) {
    const { key, version } = updateBody(name, record);
    return { key, version };
  }
  async function create(name: string, body: object) {
    const response = await send('post', name, body).expect(201);
    return response.body.data as CrudRecord;
  }
  const matchValues = {
    idSeasonDivision: competitionId,
    idRound: 1,
    team1Id: team1,
    team2Id: team2
  };
  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
    await db.insert(schema.discordUsers).values([
      { discordId: actorId, username: 'Admin', role: 'admin' },
      { discordId: memberId, username: 'Member' }
    ]);
    for (const [value, id] of [
      [token, actorId],
      [viewerToken, memberId]
    ]) {
      await db.insert(schema.authSessions).values({
        tokenHash: createHash('sha256').update(String(value)).digest('hex'),
        discordUserId: String(id),
        expiresAt: new Date(Date.now() + 60000 * 60)
      });
    }
    await db.insert(schema.seasons).values({ name: 'Base season' });
    await db.insert(schema.divisions).values({ name: 'Base division' });
    await db
      .insert(schema.seasonsDivisions)
      .values({ id: competitionId, seasonName: 'Base season', divisionName: 'Base division' });
    await db.insert(schema.teams).values([
      { id: team1, seasonDivisionId: competitionId, name: 'Home' },
      { id: team2, seasonDivisionId: competitionId, name: 'Away' }
    ]);
    await db.insert(schema.rounds).values({ id: 1, idSeasonDivision: competitionId });
  });
  afterAll(() => client.close());

  it('requires admin sessions for reads and writes and trusted origins for every mutation', async () => {
    for (const method of ['get', 'post', 'put', 'delete'] as const) {
      await request(app)[method](endpoint('seasons')).expect(401);
      await request(app)
        [method](endpoint('seasons'))
        .set('Cookie', `rcl_session=${viewerToken}`)
        .expect(403);
    }
    for (const method of ['post', 'put', 'delete'] as const) {
      await request(app)
        [method](endpoint('seasons'))
        .set('Cookie', cookie)
        .send({ name: 'Attack' })
        .expect(403);
      await request(app)
        [method](endpoint('seasons'))
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .send({ name: 'Attack' })
        .expect(403);
    }
    const catalog = await request(app).get(endpoint('resources')).set('Cookie', cookie).expect(200);
    expect(catalog.headers['cache-control']).toBe('no-store');
    expect(catalog.body.data).toHaveLength(9);
    expect(JSON.stringify(catalog.body)).not.toContain('tokenHash');
    await request(app).get(endpoint('auth_sessions')).set('Cookie', cookie).expect(404);
    await send('post', 'users', {
      discordId: '323456789012345678',
      username: 'Escalation',
      role: 'admin'
    }).expect(422);
  });

  it.each([
    ['seasons', { name: 'CRUD season' }, { startsOn: '2026-10-01' }],
    ['divisions', { name: 'CRUD division' }, { sortOrder: 2 }],
    ['teams', { seasonDivisionId: competitionId, name: 'CRUD team' }, { name: 'Renamed team' }],
    [
      'users',
      { discordId: '323456789012345678', username: 'CRUD member' },
      { globalName: 'Visible name' }
    ],
    [
      'players',
      { gameName: 'CRUD player', riotTag: 'EUW', discordUserId: memberId },
      { isMain: true }
    ],
    ['memberships', { teamId: team1, discordUserId: memberId, role: 'top' }, { isCaptain: true }],
    ['rounds', { id: 9, idSeasonDivision: competitionId }, { stage: 'playoff', name: 'Final' }],
    [
      'matches',
      { idSeasonDivision: competitionId, team1Id: team1, team2Id: team2 },
      { notes: 'Updated from admin' }
    ]
  ] as const)(
    'creates, reads, updates and deletes %s with audit records',
    async (name, values, changes) => {
      const record = await create(name, values);
      const list = await request(app).get(endpoint(name)).set('Cookie', cookie).expect(200);
      expect(list.body.data.records).toContainEqual(expect.objectContaining(record));
      const updated = await send('put', name, updateBody(name, record, changes)).expect(200);
      expect(updated.body.data).toMatchObject(changes);
      await send('delete', name, deleteBody(name, updated.body.data)).expect(204);
      await send('delete', name, deleteBody(name, updated.body.data)).expect(404);
      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityType, name));
      expect(logs.slice(-3).map((log) => log.action)).toEqual([
        'admin.create',
        'admin.update',
        'admin.delete'
      ]);
      expect(logs.at(-1)?.actorDiscordUserId).toBe(actorId);
      if (name === 'memberships') {
        const movements = await db.select().from(schema.rosterMovements);
        expect(movements.map((movement) => movement.action)).toEqual([
          'joined',
          'promoted_to_captain',
          'left'
        ]);
      }
    }
  );

  it('creates and removes season/division assignments and rejects mutable identity fields', async () => {
    await create('seasons', { name: 'Extra season' });
    const row = await create('competitions', {
      seasonName: 'Extra season',
      divisionName: 'Base division'
    });
    await send('put', 'competitions', updateBody('competitions', row)).expect(200);
    const latest = (
      await request(app)
        .get(endpoint('competitions'))
        .query({ search: 'Extra season' })
        .set('Cookie', cookie)
    ).body.data.records[0];
    await send(
      'put',
      'competitions',
      updateBody('competitions', latest, { seasonName: 'Base season' })
    ).expect(409);
    await send('delete', 'competitions', deleteBody('competitions', latest)).expect(204);
  });

  it('rejects stale edits and stale deletes without overwriting the first change', async () => {
    const row = await create('seasons', { name: 'Concurrent season' });
    await send('put', 'seasons', updateBody('seasons', row, { startsOn: '2026-01-01' })).expect(
      200
    );
    await send('put', 'seasons', updateBody('seasons', row, { startsOn: '2026-02-01' })).expect(
      409
    );
    await send('delete', 'seasons', deleteBody('seasons', row)).expect(409);
    expect(
      (
        await db.select().from(schema.seasons).where(eq(schema.seasons.name, 'Concurrent season'))
      )[0]?.startsOn
    ).toBe('2026-01-01');
  });

  it('blocks cascading deletes and preserves imported match results while allowing scheduling edits', async () => {
    const row = await create('matches', matchValues);
    await db
      .insert(schema.matchGames)
      .values({ matchesId: String(row.id), gameNumber: 1, blueTeamId: team1, redTeamId: team2 });
    await send('delete', 'matches', deleteBody('matches', row)).expect(409);
    await send('put', 'matches', updateBody('matches', row, { bestOf: 3 })).expect(409);
    await send(
      'put',
      'matches',
      updateBody('matches', row, { notes: 'Live stream', scheduledAt: '2026-10-01T18:00:00.000Z' })
    ).expect(200);
    for (const [name, search] of [
      ['teams', 'Home'],
      ['seasons', 'Base season'],
      ['divisions', 'Base division'],
      ['rounds', '1']
    ]) {
      const list = await request(app)
        .get(endpoint(String(name)))
        .query({ search })
        .set('Cookie', cookie)
        .expect(200);
      const record = list.body.data.records[0];
      expect(record).toBeTruthy();
      await send('delete', String(name), deleteBody(String(name), record)).expect(409);
    }
    expect(await db.select().from(schema.matchGames)).toHaveLength(1);
  });

  it('enforces dates, URLs, scores and competition membership and rejects the removed season flag', async () => {
    await send('post', 'seasons', { name: 'Bad date', startsOn: '2026-02-30' }).expect(422);
    await send('post', 'seasons', {
      name: 'Inverted dates',
      startsOn: '2026-09-01',
      endsOn: '2026-01-01'
    }).expect(422);
    const season = await create('seasons', { name: 'Another season' });
    expect(season).not.toHaveProperty('isActive');
    await send('post', 'seasons', { name: 'Removed flag', isActive: true }).expect(422);
    await send('put', 'seasons', updateBody('seasons', season, { isActive: false })).expect(422);
    expect(
      await db.select().from(schema.seasons).where(eq(schema.seasons.name, 'Removed flag'))
    ).toHaveLength(0);
    await send('post', 'teams', {
      seasonDivisionId: competitionId,
      name: 'Unsafe',
      logoUrl: 'javascript:alert(1)'
    }).expect(422);
    await send('post', 'players', {
      gameName: 'Missing member',
      discordUserId: '999999999999999999'
    }).expect(409);
    for (const changes of [
      { team2Id: team1 },
      { bestOf: 2 },
      { status: 'completed' },
      { team1Score: -1 },
      { team1Score: 1, status: 'scheduled' },
      { scheduledAt: '2026-10-01T10:00:00-02:00', finishedAt: '2026-10-01T11:00:00+02:00' }
    ]) {
      await send('post', 'matches', { ...matchValues, ...changes }).expect(422);
    }
    const otherCompetition = await create('competitions', {
      seasonName: 'Another season',
      divisionName: 'Base division'
    });
    await send('post', 'matches', { ...matchValues, idSeasonDivision: otherCompetition.id }).expect(
      409
    );
    const manual = await create('matches', {
      ...matchValues,
      idRound: null,
      status: 'completed',
      winnerTeamId: team1,
      team1Score: 1
    });
    const standings = await request(app)
      .get(`/api/v1/divisions/${competitionId}/calendar`)
      .expect(200);
    expect(standings.body.data.some((match: { id: string }) => match.id === manual.id)).toBe(true);
  });

  it('paginates and searches literally without SQL interpolation', async () => {
    await db.insert(schema.divisions).values(
      Array.from({ length: 52 }, (_, index) => ({
        name: `Pagination ${String(index).padStart(2, '0')}`
      }))
    );
    const list = await request(app)
      .get(endpoint('divisions'))
      .query({ search: 'Pagination' })
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body.data.records).toHaveLength(50);
    expect(list.body.data.hasMore).toBe(true);
    const next = await request(app)
      .get(endpoint('divisions'))
      .query({ search: 'Pagination', offset: 50 })
      .set('Cookie', cookie)
      .expect(200);
    expect(next.body.data.records).toHaveLength(2);
    expect(next.body.data.hasMore).toBe(false);
    for (const search of ["' OR 1=1 --", '%', '_']) {
      const result = await request(app)
        .get(endpoint('divisions'))
        .query({ search })
        .set('Cookie', cookie)
        .expect(200);
      expect(result.body.data.records).toHaveLength(0);
    }
    await request(app)
      .get(endpoint('divisions'))
      .query({ offset: -1 })
      .set('Cookie', cookie)
      .expect(422);
  });
});
