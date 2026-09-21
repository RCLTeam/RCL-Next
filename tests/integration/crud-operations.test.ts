import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { CrudDeletePreview, CrudRecord } from '@rcl/contracts';
import { eq, sql } from 'drizzle-orm';
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
    expect(catalog.body.data).toHaveLength(7);
    expect(JSON.stringify(catalog.body)).not.toContain('tokenHash');
    await request(app).get(endpoint('auth_sessions')).set('Cookie', cookie).expect(404);
  });

  it('excludes members and matches from CRUD but provides protected read-only Discord references', async () => {
    const catalog = await request(app).get(endpoint('resources')).set('Cookie', cookie).expect(200);
    expect(catalog.body.data.map((resource: { name: string }) => resource.name)).not.toContain(
      'users'
    );
    expect(catalog.body.data.map((resource: { name: string }) => resource.name)).not.toContain(
      'matches'
    );
    for (const resource of ['users', 'matches']) {
      await request(app).get(endpoint(resource)).set('Cookie', cookie).expect(404);
      for (const method of ['post', 'put', 'delete'] as const)
        await send(method, resource, {}).expect(404);
    }
    await request(app).get(endpoint('references/users')).expect(401);
    await request(app)
      .get(endpoint('references/users'))
      .set('Cookie', `rcl_session=${viewerToken}`)
      .expect(403);
    const references = await request(app)
      .get(endpoint('references/users'))
      .query({ search: 'Member' })
      .set('Cookie', cookie)
      .expect(200);
    expect(references.body.data.records).toEqual([
      expect.objectContaining({ discordId: memberId, username: 'Member' })
    ]);
    expect(references.body.data.records[0]).not.toHaveProperty('role');
    expect(references.body.data.records[0]).not.toHaveProperty('tokenHash');
    for (const method of ['post', 'put', 'delete'] as const)
      await send(method, 'references/users', {}).expect(404);
    await request(app).get(endpoint('references/matches')).set('Cookie', cookie).expect(404);
    expect(await db.select().from(schema.discordUsers)).toHaveLength(2);
  });

  it.each([
    ['seasons', { name: 'CRUD season' }, { startsOn: '2026-10-01' }],
    ['divisions', { name: 'CRUD division' }, { sortOrder: 2 }],
    ['teams', { seasonDivisionId: competitionId, name: 'CRUD team' }, { name: 'Renamed team' }],
    [
      'players',
      { gameName: 'CRUD player', riotTag: 'EUW', discordUserId: memberId },
      { isMain: true }
    ],
    ['memberships', { teamId: team1, discordUserId: memberId, role: 'top' }, { isCaptain: true }],
    ['rounds', { id: 9, idSeasonDivision: competitionId }, { stage: 'playoff', name: 'Final' }]
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

  it('blocks cascading deletes of records referenced by existing matches', async () => {
    const [row] = await db.insert(schema.matches).values(matchValues).returning();
    if (!row) throw new Error('Missing match fixture');
    await db
      .insert(schema.matchGames)
      .values({ matchesId: row.id, gameNumber: 1, blueTeamId: team1, redTeamId: team2 });
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

  it('enforces dates, URLs and player references and rejects the removed season flag', async () => {
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

  it('previews and confirms owner-only cascades, rejecting stale plans and revoked ownership', async () => {
    const ownerId = '723456789012345678';
    const ownerToken = '7'.repeat(64);
    const ownerCookie = `rcl_session=${ownerToken}`;
    await db
      .insert(schema.discordUsers)
      .values({ discordId: ownerId, username: 'Owner', role: 'owner' });
    await db.insert(schema.authSessions).values({
      tokenHash: createHash('sha256').update(ownerToken).digest('hex'),
      discordUserId: ownerId,
      expiresAt: new Date(Date.now() + 3600000)
    });
    const season = await create('seasons', { name: 'Cascade season' });
    const competition = await create('competitions', {
      seasonName: 'Cascade season',
      divisionName: 'Base division'
    });
    const home = await create('teams', { name: 'Cascade home', seasonDivisionId: competition.id });
    const away = await create('teams', { name: 'Cascade away', seasonDivisionId: competition.id });
    await create('rounds', { id: 1, idSeasonDivision: competition.id });
    await create('memberships', { teamId: home.id, discordUserId: memberId, role: 'top' });
    const [match] = await db
      .insert(schema.matches)
      .values({
        idSeasonDivision: String(competition.id),
        idRound: 1,
        team1Id: String(home.id),
        team2Id: String(away.id)
      })
      .returning();
    if (!match) throw new Error('Missing match');
    const [game] = await db
      .insert(schema.matchGames)
      .values({
        matchesId: match.id,
        gameNumber: 1,
        blueTeamId: String(home.id),
        redTeamId: String(away.id)
      })
      .returning();
    const [player] = await db
      .insert(schema.players)
      .values({ gameName: 'Cascade player', discordUserId: memberId })
      .returning();
    if (!game || !player) throw new Error('Missing game/player');
    await db.transaction(async (tx) => {
      const [info] = await tx
        .insert(schema.playerGameInfo)
        .values({
          matchGameId: game.id,
          playerId: player.id,
          teamId: String(home.id),
          side: 'blue',
          champion: 'Ahri'
        })
        .returning();
      if (!info) throw new Error('Missing participant');
      await tx.insert(schema.playerGameStats).values({ id: info.id });
      await tx.insert(schema.playerGameBuild).values({ id: info.id });
      await tx.insert(schema.playerGameRunes).values({
        id: info.id,
        primaryKeystoneId: 1,
        secundaryRuneId: 1,
        primaryPerk: 1,
        primaryPerk1: 1,
        primaryPerk2: 1,
        primaryPerk3: 1,
        secundaryPerk1: 1,
        secundaryPerk2: 1,
        statPerkOffense: 1,
        statPerkFlex: 1,
        statPerkDefense: 1
      });
    });
    await db
      .insert(schema.predictions)
      .values({ discordUserId: memberId, matchId: match.id, selectedTeamId: String(home.id) });
    const body = deleteBody('seasons', season);
    const previewRequest = () =>
      request(app)
        .post(`${endpoint('seasons')}/delete-preview`)
        .set('Cookie', ownerCookie)
        .set('Origin', origin)
        .send(body);
    const remove = (confirmation: string, session = ownerCookie) =>
      request(app)
        .delete(endpoint('seasons'))
        .set('Cookie', session)
        .set('Origin', origin)
        .send({ ...body, cascadeConfirmation: confirmation });
    await request(app)
      .post(`${endpoint('seasons')}/delete-preview`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send(body)
      .expect(403);
    await request(app)
      .post(`${endpoint('seasons')}/delete-preview`)
      .set('Cookie', ownerCookie)
      .send(body)
      .expect(403);
    await send('delete', 'seasons', body).expect(409);
    const preview = (await previewRequest().expect(200)).body.data as CrudDeletePreview;
    expect(preview.allowed).toBe(true);
    expect(preview.impacts.map(({ table, count, action }) => ({ table, count, action }))).toEqual(
      expect.arrayContaining([
        { table: 'seasons', count: 1, action: 'delete' },
        { table: 'teams', count: 2, action: 'delete' },
        { table: 'matches', count: 1, action: 'delete' },
        { table: 'match_games', count: 1, action: 'delete' },
        { table: 'player_game_info', count: 1, action: 'delete' },
        { table: 'player_game_stats', count: 1, action: 'delete' },
        { table: 'player_game_build', count: 1, action: 'delete' },
        { table: 'player_game_runes', count: 1, action: 'delete' },
        { table: 'predictions', count: 1, action: 'delete' },
        { table: 'team_memberships', count: 1, action: 'delete' },
        { table: 'roster_movements', count: 1, action: 'delete' }
      ])
    );
    await remove(preview.confirmation, cookie).expect(403);
    await remove('0'.repeat(64)).expect(409);
    await db
      .update(schema.teams)
      .set({ name: 'Changed after preview' })
      .where(eq(schema.teams.id, String(home.id)));
    expect((await remove(preview.confirmation).expect(409)).body.error.code).toBe(
      'DELETE_PREVIEW_CHANGED'
    );
    const next = (await previewRequest().expect(200)).body.data as CrudDeletePreview;
    await create('teams', { name: 'New dependency', seasonDivisionId: competition.id });
    await remove(next.confirmation).expect(409);
    const latest = (await previewRequest().expect(200)).body.data as CrudDeletePreview;
    await db.execute(
      sql`CREATE FUNCTION reject_delete_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'admin.delete' THEN RAISE EXCEPTION 'Forced audit failure' USING ERRCODE = '23514'; END IF; RETURN NEW; END; $$`
    );
    await db.execute(
      sql`CREATE TRIGGER reject_delete_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_delete_audit()`
    );
    try {
      await remove(latest.confirmation).expect(409);
      expect(
        await db
          .select()
          .from(schema.playerGameInfo)
          .where(eq(schema.playerGameInfo.matchGameId, game.id))
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(schema.rounds)
          .where(eq(schema.rounds.idSeasonDivision, String(competition.id)))
      ).toHaveLength(1);
    } finally {
      await db.execute(sql`DROP TRIGGER reject_delete_audit ON audit_logs`);
      await db.execute(sql`DROP FUNCTION reject_delete_audit()`);
    }
    await db
      .update(schema.discordUsers)
      .set({ role: 'admin' })
      .where(eq(schema.discordUsers.discordId, ownerId));
    await remove(latest.confirmation).expect(403);
    await db
      .update(schema.discordUsers)
      .set({ role: 'owner' })
      .where(eq(schema.discordUsers.discordId, ownerId));
    await remove(latest.confirmation).expect(204);
    expect(
      await db.select().from(schema.matches).where(eq(schema.matches.id, match.id))
    ).toHaveLength(0);
    expect(
      await db.select().from(schema.matchGames).where(eq(schema.matchGames.matchesId, match.id))
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.seasonDivisionId, String(competition.id)))
    ).toHaveLength(0);
    expect(
      await db.select().from(schema.seasons).where(eq(schema.seasons.name, 'Base season'))
    ).toHaveLength(1);
    expect(
      await db.select().from(schema.rounds).where(eq(schema.rounds.idSeasonDivision, competitionId))
    ).toHaveLength(1);
    expect(
      await db.select().from(schema.rosterMovements).where(eq(schema.rosterMovements.teamId, team1))
    ).toHaveLength(3);
    expect(
      await db.select().from(schema.discordUsers).where(eq(schema.discordUsers.discordId, memberId))
    ).toHaveLength(1);
    expect(
      await db.select().from(schema.players).where(eq(schema.players.id, player.id))
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.playerGameInfo)
        .where(eq(schema.playerGameInfo.matchGameId, game.id))
    ).toHaveLength(0);
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.actorDiscordUserId, ownerId));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.before).toMatchObject({ record: { name: 'Cascade season' }, cascade: latest });
  });

  it('reports protected RESTRICT references and non-nullable SET NULL dependencies without deleting', async () => {
    const ownerCookie = `rcl_session=${'7'.repeat(64)}`;
    const [protectedTeam] = await db
      .insert(schema.teams)
      .values({ name: 'Protected reference', seasonDivisionId: competitionId })
      .returning();
    const [match] = await db.select().from(schema.matches);
    if (!protectedTeam || !match) throw new Error('Missing fixtures');
    await db
      .insert(schema.predictions)
      .values({ discordUserId: memberId, matchId: match.id, selectedTeamId: protectedTeam.id });
    for (const [name, search, table] of [
      ['teams', 'Protected reference', 'predictions'],
      ['rounds', '1', 'matches']
    ]) {
      const record = (
        await request(app)
          .get(endpoint(String(name)))
          .query({ search })
          .set('Cookie', cookie)
          .expect(200)
      ).body.data.records[0];
      const body = deleteBody(String(name), record);
      const preview = (
        await request(app)
          .post(`${endpoint(String(name))}/delete-preview`)
          .set('Cookie', ownerCookie)
          .set('Origin', origin)
          .send(body)
          .expect(200)
      ).body.data as CrudDeletePreview;
      expect(preview.allowed).toBe(false);
      expect(preview.impacts).toEqual(
        expect.arrayContaining([expect.objectContaining({ table, action: 'blocked', count: 1 })])
      );
      await request(app)
        .delete(endpoint(String(name)))
        .set('Cookie', ownerCookie)
        .set('Origin', origin)
        .send({ ...body, cascadeConfirmation: preview.confirmation })
        .expect(409);
    }
    expect(
      await db.select().from(schema.teams).where(eq(schema.teams.id, protectedTeam.id))
    ).toHaveLength(1);
  });
});
