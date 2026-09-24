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
import { PostgresHomeContentRepository } from '../../apps/api/src/modules/home-content/postgres-home-content.repository.js';
import * as schema from '../../packages/database/src/schema.js';

describe('home content publication, authorization and persistence', () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const origin = 'http://localhost:5173';
  const tokens = { admin: 'a'.repeat(64), viewer: 'b'.repeat(64) };
  const app = createApp({
    repository: new PostgresCompetitionRepository(db),
    homeContentRepository: new PostgresHomeContentRepository(db),
    checkDatabase: async () => {},
    corsOrigin: origin,
    auth: {
      service: new AuthService(
        new PostgresAuthRepository(db),
        new DiscordOAuthClient({
          clientId: '123456789012345678',
          clientSecret: 'test',
          redirectUri: `${origin}/callback`
        })
      ),
      secureCookies: false,
      frontendOrigin: origin
    }
  });
  const root = '/api/v1/home-content';
  const article = {
    title: 'La final',
    excerpt: 'Una jornada para recordar.',
    body: 'Primera crónica.\n\n## La final\n\n> Una gran victoria.',
    kind: 'reportaje',
    author: 'RCL',
    coverUrl: '',
    coverAlt: '',
    published: false,
    showOnHome: true,
    homeOrder: 2
  };
  const teamIdA = '11111111-1111-4111-8111-111111111111';
  const teamIdB = '22222222-2222-4222-8222-222222222222';
  const team = {
    roundId: 1,
    label: 'Jornada 3',
    published: true,
    players: ['top', 'jungle', 'mid', 'adc', 'support'].map((role, index) => ({
      playerId: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
      teamId: teamIdA,
      role,
      name: `Player ${role}`,
      team: 'Rebels',
      imageUrl: ''
    }))
  };
  const divisionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const divisionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const cookie = (role: keyof typeof tokens) => `rcl_session=${tokens[role]}`;
  const post = (body: object) =>
    request(app)
      .post(`${root}/admin/articles`)
      .set('Cookie', cookie('admin'))
      .set('Origin', origin)
      .send(body);
  const put = (path: string, body: object) =>
    request(app)
      .put(`${root}/admin/${path}`)
      .set('Cookie', cookie('admin'))
      .set('Origin', origin)
      .send(body);
  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
    for (const [index, role] of (['admin', 'viewer'] as const).entries()) {
      const id = `${index + 1}23456789012345678`;
      await db.insert(schema.discordUsers).values({ discordId: id, username: role, role });
      await db.insert(schema.authSessions).values({
        tokenHash: createHash('sha256').update(tokens[role]).digest('hex'),
        discordUserId: id,
        expiresAt: new Date(Date.now() + 3600000)
      });
    }
    await db.insert(schema.seasons).values({ name: 'Season' });
    await db.insert(schema.divisions).values([{ name: 'Alpha' }, { name: 'Beta' }]);
    await db.insert(schema.seasonsDivisions).values([
      { id: divisionA, seasonName: 'Season', divisionName: 'Alpha' },
      { id: divisionB, seasonName: 'Season', divisionName: 'Beta' }
    ]);
    await db
      .insert(schema.players)
      .values(team.players.map((player) => ({ id: player.playerId, gameName: player.name })));
    for (const [divisionId, homeId] of [
      [divisionA, teamIdA],
      [divisionB, teamIdB]
    ] as const) {
      const [away] = await db
        .insert(schema.teams)
        .values({ name: 'Away', seasonDivisionId: divisionId })
        .returning();
      if (!away) throw new Error('Missing fixture team');
      await db
        .insert(schema.teams)
        .values({ id: homeId, name: 'Rebels', seasonDivisionId: divisionId });
      for (const roundId of [1, 2, 3]) {
        await db.insert(schema.rounds).values({ id: roundId, idSeasonDivision: divisionId });
        if (roundId === 3) continue;
        const [match] = await db
          .insert(schema.matches)
          .values({
            idSeasonDivision: divisionId,
            idRound: roundId,
            team1Id: homeId,
            team2Id: away.id
          })
          .returning();
        if (!match) throw new Error('Missing fixture match');
        for (const [gameIndex, champion] of (roundId === 1
          ? ['Ahri']
          : ['Ahri', 'Ashe', 'Garen', 'Jhin', 'Lux']
        ).entries()) {
          const [game] = await db
            .insert(schema.matchGames)
            .values({
              matchesId: match.id,
              gameNumber: gameIndex + 1,
              blueTeamId: homeId,
              redTeamId: away.id
            })
            .returning();
          if (!game) throw new Error('Missing fixture game');
          await db.transaction(async (tx) => {
            const infos = await tx
              .insert(schema.playerGameInfo)
              .values(
                team.players.map((player) => ({
                  matchGameId: game.id,
                  playerId: player.playerId,
                  teamId: homeId,
                  side: 'blue' as const,
                  champion,
                  position:
                    roundId === 2 && gameIndex === 1 && player.role === 'top'
                      ? 'MIDDLE'
                      : {
                          top: 'TOP',
                          jungle: 'JUNGLE',
                          mid: 'MIDDLE',
                          adc: 'BOTTOM',
                          support: 'UTILITY'
                        }[player.role]
                }))
              )
              .returning();
            for (const { id } of infos) {
              await tx.insert(schema.playerGameStats).values({ id });
              await tx.insert(schema.playerGameBuild).values({ id });
              await tx.insert(schema.playerGameRunes).values({
                id,
                primaryKeystoneId: 0,
                secundaryRuneId: 0,
                primaryPerk: 0,
                primaryPerk1: 0,
                primaryPerk2: 0,
                primaryPerk3: 0,
                secundaryPerk1: 0,
                secundaryPerk2: 0,
                statPerkOffense: 0,
                statPerkFlex: 0,
                statPerkDefense: 0
              });
            }
          });
        }
      }
    }
  });
  afterAll(() => client.close());
  it('protects administration and rejects untrusted mutations', async () => {
    await request(app).get(`${root}/admin/articles`).expect(401);
    await request(app).get(`${root}/admin/articles`).set('Cookie', cookie('viewer')).expect(403);
    await request(app)
      .post(`${root}/admin/articles`)
      .set('Cookie', cookie('viewer'))
      .set('Origin', origin)
      .send(article)
      .expect(403);
    await request(app)
      .post(`${root}/admin/articles`)
      .set('Cookie', cookie('admin'))
      .set('Origin', 'https://evil.example')
      .send(article)
      .expect(403);
    await request(app)
      .put(`${root}/admin/weekly-teams/${divisionA}`)
      .set('Cookie', cookie('admin'))
      .send(team)
      .expect(403);
  });
  it('keeps drafts private, publishes, orders and hides articles independently of publication', async () => {
    const created = await post(article).expect(201);
    const id = created.body.data.id as string;
    await request(app).get(`${root}/articles/${id}`).expect(404);
    expect((await request(app).get(`${root}/articles`)).body.data).toHaveLength(0);
    const published = await put(`articles/${id}`, { ...article, published: true }).expect(200);
    expect(published.body.data.publishedAt).toBeTruthy();
    const first = await post({
      ...article,
      title: 'Entrevista',
      kind: 'entrevista',
      published: true,
      homeOrder: 0
    }).expect(201);
    const home = await request(app).get(`${root}/articles`).expect(200);
    expect(home.body.data.map((item: { id: string }) => item.id)).toEqual([first.body.data.id, id]);
    await put(`articles/${id}`, { ...article, published: true, showOnHome: false }).expect(200);
    await request(app).get(`${root}/articles/${id}`).expect(200);
    expect((await request(app).get(`${root}/articles`)).body.data).toHaveLength(1);
    await put(`articles/${id}`, { ...article, published: false }).expect(200);
    await request(app).get(`${root}/articles/${id}`).expect(404);
    await request(app)
      .delete(`${root}/admin/articles/${id}`)
      .set('Cookie', cookie('admin'))
      .set('Origin', origin)
      .expect(200);
    await put(`articles/${id}`, article).expect(404);
    const audit = await db.select().from(schema.auditLogs);
    expect(audit.some((row) => row.action === 'editorial.delete' && row.entityId === id)).toBe(
      true
    );
  });
  it('isolates each division and supports draft/unpublish without losing the selection', async () => {
    await put(`weekly-teams/${divisionA}`, team).expect(200);
    await put(`weekly-teams/${divisionB}`, {
      ...team,
      label: 'Beta week',
      players: team.players.map((player) => ({ ...player, teamId: teamIdB })),
      published: false
    }).expect(200);
    expect((await request(app).get(`${root}/weekly-teams/${divisionA}`)).body.data.label).toBe(
      'Jornada 3'
    );
    expect((await request(app).get(`${root}/weekly-teams/${divisionB}`)).body.data).toBeNull();
    expect(
      (
        await request(app)
          .get(`${root}/admin/weekly-teams/${divisionB}`)
          .set('Cookie', cookie('admin'))
      ).body.data.label
    ).toBe('Beta week');
    await put(`weekly-teams/${divisionA}`, { ...team, published: false }).expect(200);
    expect((await request(app).get(`${root}/weekly-teams/${divisionA}`)).body.data).toBeNull();
  });
  it('lists only published rounds, preserves previous weeks and validates historical picks', async () => {
    await put(`weekly-teams/${divisionA}`, team).expect(200);
    await put(`weekly-teams/${divisionA}`, { ...team, roundId: 2, label: 'Second week' }).expect(
      200
    );
    const published = await request(app)
      .get(`${root}/weekly-teams/${divisionA}/rounds`)
      .expect(200);
    expect(published.body.data.map((item: { roundId: number }) => item.roundId)).toEqual([2, 1]);
    expect(published.body.data[1].players[0].champions).toEqual(['Ahri']);
    expect(published.body.data[0].players[0].champions).toEqual([
      'Ahri',
      'Ashe',
      'Garen',
      'Jhin',
      'Lux'
    ]);
    await put(`weekly-teams/${divisionA}`, { ...team, roundId: 2, published: false }).expect(200);
    expect(
      (await request(app).get(`${root}/weekly-teams/${divisionA}/rounds`)).body.data.map(
        (item: { roundId: number }) => item.roundId
      )
    ).toEqual([1]);
    const candidates = await request(app)
      .get(`${root}/admin/weekly-teams/${divisionA}/candidates/1`)
      .set('Cookie', cookie('admin'))
      .expect(200);
    expect(candidates.body.data).toHaveLength(5);
    expect(candidates.body.data[0].champions).toEqual(['Ahri']);
    expect(
      candidates.body.data.find(
        (item: { playerId: string }) => item.playerId === team.players[0]?.playerId
      ).roles
    ).toEqual(['top']);
    const secondRound = await request(app)
      .get(`${root}/admin/weekly-teams/${divisionA}/candidates/2`)
      .set('Cookie', cookie('admin'))
      .expect(200);
    expect(
      secondRound.body.data
        .find((item: { playerId: string }) => item.playerId === team.players[0]?.playerId)
        .roles.sort()
    ).toEqual(['mid', 'top']);
    await put(`weekly-teams/${divisionA}`, {
      ...team,
      players: team.players.map((player) => ({
        ...player,
        role: player.role === 'top' ? 'mid' : player.role === 'mid' ? 'top' : player.role
      }))
    }).expect(422);
    await request(app).get(`${root}/admin/weekly-teams/${divisionA}/candidates/1`).expect(401);
    await put(`weekly-teams/${divisionA}`, { ...team, roundId: 3 }).expect(422);
    await put(`weekly-teams/${divisionA}`, {
      ...team,
      players: team.players.map((player) => ({ ...player, champions: ['UnusedChampion'] }))
    }).expect(200);
    expect(
      (await request(app).get(`${root}/weekly-teams/${divisionA}`)).body.data.players[0].champions
    ).toEqual(['Ahri']);
    await put(`weekly-teams/${divisionB}`, team).expect(422);
    await put(`weekly-teams/${divisionA}`, {
      ...team,
      players: team.players.map((player) => ({ ...player, playerId: team.players[0]?.playerId }))
    }).expect(422);
    await put(`weekly-teams/${divisionA}`, { ...team, roundId: 99 }).expect(404);
  });
  it('validates content, image schemes, duplicate roles and missing divisions', async () => {
    await post({ ...article, title: ' ' }).expect(422);
    await post({ ...article, coverUrl: 'javascript:alert(1)' }).expect(422);
    await post({ ...article, coverUrl: 'https://example.com/image.jpg' }).expect(422);
    await post({ ...article, homeOrder: -1 }).expect(422);
    await put(`weekly-teams/${divisionA}`, {
      ...team,
      players: Array(5).fill(team.players[0])
    }).expect(422);
    await put(`weekly-teams/${divisionA}`, { ...team, players: team.players.slice(1) }).expect(422);
    await put('weekly-teams/cccccccc-cccc-4ccc-8ccc-cccccccccccc', team).expect(404);
  });
});
