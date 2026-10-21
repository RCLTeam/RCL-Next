import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { COMPETITIVE_ROLES, type Player, ROSTER_ROLES } from '@rcl/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { assert, expect, onTestFinished, test } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { CompetitionService } from '../../apps/api/src/modules/competition/competition.service.js';
import { loadMatchMvpRows } from '../../apps/api/src/modules/competition/match-mvp-data.js';
import { playerMvpRanking } from '../../apps/api/src/modules/competition/player-statistics.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import * as schema from '../../packages/database/src/schema.js';

const matchId = '70000000-0000-4000-8000-000000000001';
const nextMatchId = '70000000-0000-4000-8000-000000000002';
const divisionId = '20000000-0000-4000-8000-000000000001';
const otherDivisionId = '20000000-0000-4000-8000-000000000002';
const homeId = '30000000-0000-4000-8000-000000000001';
const awayId = '30000000-0000-4000-8000-000000000002';

async function setup() {
  const client = new PGlite({ extensions: { btree_gist } });
  onTestFinished(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
  });
  await client.exec(await readFile('packages/database/seed/demo.sql', 'utf8'));
  const [player] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.gameName, 'Jugador Demo 1'));
  const [other] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.gameName, 'Jugador Demo 2'));
  assert.ok(player?.discordUserId && other);
  const repository = new PostgresCompetitionRepository(db);
  return { client, db, player, other, repository, service: new CompetitionService(repository) };
}

test('division HTTP directory admits only competitive registrations without results', async () => {
  const { db, repository, service } = await setup();
  const [home] = await db.select().from(schema.teams).where(eq(schema.teams.id, homeId));
  assert.ok(home);
  await db
    .insert(schema.discordUsers)
    .values(ROSTER_ROLES.map((role) => ({ discordId: `directory-${role}`, username: role })));
  const accounts = await db
    .insert(schema.players)
    .values(
      ROSTER_ROLES.map((role) => ({
        discordUserId: `directory-${role}`,
        gameName: `Directory ${role}`,
        isMain: true
      }))
    )
    .returning();
  await db.insert(schema.teamMemberships).values(
    ROSTER_ROLES.map((role) => ({
      discordUserId: `directory-${role}`,
      teamId: homeId,
      seasonName: home.seasonName,
      role
    }))
  );
  // A newer noncompetitive affiliation must not supply the displayed team.
  await db.insert(schema.teamMemberships).values({
    discordUserId: 'directory-substitute',
    teamId: awayId,
    seasonName: home.seasonName,
    role: 'staff',
    updatedAt: new Date('2099-01-01')
  });
  const [secondary] = await db
    .insert(schema.players)
    .values({
      discordUserId: 'directory-substitute',
      gameName: 'Directory secondary',
      isMain: false
    })
    .returning();
  assert.ok(secondary);
  const app = createApp({
    repository,
    corsOrigin: 'http://localhost:5173',
    checkDatabase: async () => {
      await db.select().from(schema.seasons).limit(1);
    }
  });
  const response = await request(app).get(`/api/v1/divisions/${divisionId}/players`).expect(200);
  const listed: Player[] = response.body.data;
  const added = listed.filter((entry) => accounts.some((account) => account.id === entry.id));
  expect(added).toHaveLength(COMPETITIVE_ROLES.length);
  expect(added.map((entry) => entry.competition?.role).sort()).toEqual(
    [...COMPETITIVE_ROLES].sort()
  );
  expect(added.every((entry) => entry.competition?.team?.id === homeId)).toBe(true);
  expect(added.every((entry) => entry.competition?.stats === null)).toBe(true);
  expect(listed.some((entry) => entry.id === secondary.id)).toBe(false);

  await db
    .update(schema.teamMemberships)
    .set({ teamId: '30000000-0000-4000-8000-000000000003' })
    .where(eq(schema.teamMemberships.discordUserId, 'directory-top'));
  expect(
    (await service.players(divisionId)).some((entry) => entry.gameName === 'Directory top')
  ).toBe(false);
  expect(
    (await service.players(otherDivisionId)).find((entry) => entry.gameName === 'Directory top')
      ?.competition?.role
  ).toBe('top');

  // A competitive role in another season must not qualify a local staff membership.
  await db.insert(schema.seasons).values({ name: 'Other season', startsOn: '2099-01-01' });
  const [otherDivision] = await db
    .insert(schema.seasonsDivisions)
    .values({
      seasonName: 'Other season',
      divisionName: 'Ascend DEMO'
    })
    .returning();
  assert.ok(otherDivision);
  const [otherTeam] = await db
    .insert(schema.teams)
    .values({
      seasonName: 'Other season',
      seasonDivisionId: otherDivision.id,
      name: 'Other team'
    })
    .returning();
  assert.ok(otherTeam);
  await db.insert(schema.teamMemberships).values({
    discordUserId: 'directory-staff',
    teamId: otherTeam.id,
    seasonName: 'Other season',
    role: 'mid'
  });
  expect(
    (await service.players(divisionId)).some((entry) => entry.gameName === 'Directory staff')
  ).toBe(false);
  expect((await service.players(otherDivision.id)).map((entry) => entry.gameName)).toEqual([
    'Directory staff'
  ]);
});

test('division directory retains historical games and awards after moving to staff', async () => {
  const { db, player, service } = await setup();
  assert.ok(player.discordUserId);
  // Demo games have no position; record one to distinguish match history from roster fallback.
  await db
    .update(schema.playerGameInfo)
    .set({ position: 'top' })
    .where(eq(schema.playerGameInfo.playerId, player.id));
  const before = (await service.players(divisionId)).find((entry) => entry.id === player.id);
  assert.ok(before?.competition?.stats);
  await db
    .update(schema.teamMemberships)
    .set({ role: 'staff', isCaptain: false })
    .where(eq(schema.teamMemberships.discordUserId, player.discordUserId));
  const historical = (await service.players(divisionId)).find((entry) => entry.id === player.id);
  expect(historical?.competition?.stats).toEqual(before.competition.stats);
  expect(historical?.competition?.team).toEqual(before.competition.team);
  expect(historical?.competition?.role).toBe(before.competition.role);
  expect(historical?.competition?.isCaptain ?? false).toBe(false);
  await db
    .update(schema.matches)
    .set({ mvpPlayerId: player.id, mvpScore: '99.0' })
    .where(eq(schema.matches.id, matchId));
  await db.delete(schema.playerGameInfo).where(eq(schema.playerGameInfo.playerId, player.id));
  const awardsOnly = (await service.players(divisionId)).find((entry) => entry.id === player.id);
  expect(awardsOnly?.competition).toMatchObject({
    team: null,
    role: null,
    stats: null,
    mvpMatchIds: [matchId]
  });
});

test('recent staff membership cannot replace competitive registration in the persisted profile', async () => {
  const { db, player, service } = await setup();
  assert.ok(player.discordUserId);
  const before = await service.playerDetail(player.id);
  assert.ok(before.registrationTeam);
  const staffTeamId = before.registrationTeam.id === homeId ? awayId : homeId;
  await db.insert(schema.teamMemberships).values({
    teamId: staffTeamId,
    discordUserId: player.discordUserId,
    seasonName: before.registrationTeam.seasonName,
    role: 'staff',
    updatedAt: new Date('2099-01-01')
  });
  const after = await service.playerDetail(player.id);
  expect(after.teams[0]?.id).toBe(staffTeamId);
  expect(after.registrationTeam).toEqual(before.registrationTeam);
  expect(after.statisticsSeasonName).toBe(before.statisticsSeasonName);
  expect(after.competition).toEqual(before.competition);

  await db
    .update(schema.teamMemberships)
    .set({ role: 'coach', isCaptain: false })
    .where(eq(schema.teamMemberships.discordUserId, player.discordUserId));
  const retired = await service.playerDetail(player.id);
  expect(retired.registrationTeam).toBeNull();
  expect(retired.competition?.team).toBeNull();
  expect(retired.statisticsSeasonName).toBe(before.statisticsSeasonName);
  expect(retired.competition?.stats).toEqual(before.competition?.stats);
});

test('all views read the sealed award, without fallback, despite stat edits and transfers', async () => {
  const { db, player, service } = await setup();
  expect((await service.matchDetail(matchId)).mvpPlayerId).toBeNull();
  expect((await service.players(divisionId)).every((p) => !p.competition?.mvpMatchIds.length)).toBe(
    true
  );
  expect((await service.playerDetail(player.id)).competition?.mvpMatchIds).toEqual([]);
  await db
    .update(schema.matches)
    .set({ mvpPlayerId: player.id, mvpScore: '0.1' })
    .where(eq(schema.matches.id, matchId));
  await db.update(schema.playerGameStats).set({ kills: 0, assists: 0, damageToChampions: 0 });
  expect((await service.matchDetail(matchId)).mvpPlayerId).toBe(player.id);
  expect((await service.calendar(divisionId)).find((m) => m.id === matchId)?.mvpPlayerId).toBe(
    player.id
  );
  expect(
    (await service.players(divisionId)).find((p) => p.id === player.id)?.competition?.mvpMatchIds
  ).toEqual([matchId]);
  expect((await service.playerDetail(player.id)).competition?.mvpMatchIds).toEqual([matchId]);
  expect(
    (await service.teamDetail(homeId)).members.find((m) => m.playerId === player.id)?.rosterStats
      ?.mvps
  ).toBe(1);

  const destination = '30000000-0000-4000-8000-000000000003';
  await db
    .update(schema.teamMemberships)
    .set({ teamId: destination, role: 'support', isCaptain: false })
    .where(eq(schema.teamMemberships.discordUserId, player.discordUserId as string));
  expect((await service.playerDetail(player.id)).competition?.mvpMatchIds).toEqual([matchId]);
  expect(
    (await service.players(divisionId)).find((p) => p.id === player.id)?.competition?.mvpMatchIds
  ).toEqual([matchId]);
  expect(
    (await service.players(otherDivisionId)).find((p) => p.id === player.id)?.competition
      ?.mvpMatchIds
  ).toEqual([]);
  expect(
    (await service.teamDetail(destination)).members.find((m) => m.playerId === player.id)
      ?.rosterStats?.mvps
  ).toBe(0);
  // Historical awards survive even if replay snapshots are no longer available.
  await db.delete(schema.playerGameInfo);
  const detail = await service.matchDetail(matchId);
  expect(detail.mvpPlayer).toMatchObject({
    id: player.id,
    gameName: player.gameName,
    slug: (await service.playerDetail(player.id)).slug
  });

  expect((await service.playerDetail(player.id)).competition?.mvpMatchIds).toEqual([matchId]);
  expect((await service.matchDetail(matchId)).mvpPlayerId).toBe(player.id);
});

test('banner uses SQL score ordering in the latest awarded round, scoped to its division', async () => {
  const { db, player, other, repository } = await setup();
  expect(await repository.featuredMatchMvp(divisionId)).toBeNull();
  await db
    .update(schema.matches)
    .set({ mvpPlayerId: player.id, mvpScore: '99.0' })
    .where(eq(schema.matches.id, matchId));
  const [rival] = await db
    .insert(schema.matches)
    .values({
      idSeasonDivision: divisionId,
      idRound: 1,
      team1Id: awayId,
      team2Id: homeId,
      status: 'completed',
      bestOf: 1,
      team2Score: 1,
      winnerTeamId: homeId,
      mvpPlayerId: other.id,
      mvpScore: '100.0'
    })
    .returning();
  assert.ok(rival);
  await db.update(schema.rounds).set({ startsAt: new Date('2020-01-01') });
  expect(await repository.featuredMatchMvp(divisionId)).toMatchObject({
    playerId: other.id,
    roundId: 1
  });
  expect(await repository.featuredMatchMvp(otherDivisionId)).toBeNull();
  // A live match with a stale award cannot displace the previous round.
  await db
    .update(schema.matches)
    .set({ status: 'live', mvpPlayerId: player.id, mvpScore: '500.0' })
    .where(eq(schema.matches.id, nextMatchId));
  expect(await repository.featuredMatchMvp(divisionId)).toMatchObject({
    playerId: other.id,
    roundId: 1
  });
  await db
    .update(schema.matches)
    .set({ status: 'completed', mvpPlayerId: null, mvpScore: null })
    .where(eq(schema.matches.id, nextMatchId));
  expect(await repository.featuredMatchMvp(divisionId)).toMatchObject({ roundId: 1 });
  await db
    .update(schema.matches)
    .set({ mvpPlayerId: player.id, mvpScore: '1.0' })
    .where(eq(schema.matches.id, nextMatchId));
  expect(await repository.featuredMatchMvp(divisionId)).toMatchObject({
    playerId: player.id,
    roundId: 2
  });
  const directory = await repository.players(divisionId);
  expect(directory.filter((p) => p.competition?.featured).map((p) => p.id)).toEqual([player.id]);
  expect(directory.find((p) => p.id === player.id)?.competition?.featured?.roundName).toBe(
    'Jornada 2'
  );
});

test('banner resolves rounded-score ties by full precision instead of match UUID', async () => {
  const { db, player, other, repository } = await setup();
  await db.update(schema.playerGameInfo).set({ position: 'mid' });
  await db.update(schema.playerGameStats).set({
    kills: 5,
    deaths: 2,
    assists: 5,
    cs: 240,
    damageToChampions: 21000,
    goldEarned: 12000,
    visionScore: 30,
    damageMitigated: 12000
  });
  const [map] = await db
    .select()
    .from(schema.matchGames)
    .where(eq(schema.matchGames.matchesId, matchId));
  assert.ok(map);
  const newMapId = crypto.randomUUID();
  await db
    .insert(schema.matchGames)
    .values({ ...map, id: newMapId, matchesId: nextMatchId, externalGameId: null });
  const participants = await db
    .select()
    .from(schema.playerGameInfo)
    .where(eq(schema.playerGameInfo.matchGameId, map.id));
  await db.transaction(async (tx) => {
    for (const participant of participants) {
      const id = crypto.randomUUID();
      await tx.insert(schema.playerGameInfo).values({ ...participant, id, matchGameId: newMapId });
      const [stats] = await tx
        .select()
        .from(schema.playerGameStats)
        .where(eq(schema.playerGameStats.id, participant.id));
      assert.ok(stats);
      await tx.insert(schema.playerGameStats).values({
        ...stats,
        id,
        damageToChampions: participant.playerId === other.id ? 21001 : 21000
      });
      for (const table of [schema.playerGameBuild, schema.playerGameRunes]) {
        const [record] = await tx.select().from(table).where(eq(table.id, participant.id));
        assert.ok(record);
        await tx.insert(table).values({ ...record, id });
      }
    }
  });
  const originalRows = await loadMatchMvpRows(db, matchId);
  const rivalRows = await loadMatchMvpRows(db, nextMatchId);
  const original = playerMvpRanking(
    player.id,
    originalRows.filter((r) => r.playerId === player.id),
    originalRows
  );
  const rival = playerMvpRanking(
    other.id,
    rivalRows.filter((r) => r.playerId === other.id),
    rivalRows
  );
  expect(rival.score).toBeGreaterThan(original.score);
  expect(rival.score.toFixed(1)).toBe(original.score.toFixed(1));
  await db
    .update(schema.matches)
    .set({ mvpPlayerId: player.id, mvpScore: original.score.toFixed(1) })
    .where(eq(schema.matches.id, matchId));
  await db
    .update(schema.matches)
    .set({
      status: 'completed',
      idRound: 1,
      mvpPlayerId: other.id,
      mvpScore: rival.score.toFixed(1)
    })
    .where(eq(schema.matches.id, nextMatchId));
  expect(await repository.featuredMatchMvp(divisionId)).toMatchObject({
    playerId: other.id,
    roundId: 1
  });
});

test('MVP checks reject negative scores and players without scores, but allow deleting the player', async () => {
  const { db, player } = await setup();
  await expect(
    db.update(schema.matches).set({ mvpScore: '-0.1' }).where(eq(schema.matches.id, matchId))
  ).rejects.toThrow();
  await expect(
    db.update(schema.matches).set({ mvpPlayerId: player.id }).where(eq(schema.matches.id, matchId))
  ).rejects.toThrow();
  await db
    .update(schema.matches)
    .set({ mvpPlayerId: player.id, mvpScore: '0.0' })
    .where(eq(schema.matches.id, matchId));
  await db.delete(schema.playerGameInfo).where(eq(schema.playerGameInfo.playerId, player.id));
  await db.delete(schema.players).where(eq(schema.players.id, player.id));
  const [match] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
  expect(match).toMatchObject({ mvpPlayerId: null, mvpScore: '0.0' });
});

test('a player without active memberships retains season games and persisted MVPs', async () => {
  const { db, player, service } = await setup();
  await db
    .update(schema.matches)
    .set({ mvpPlayerId: player.id, mvpScore: '99.0' })
    .where(eq(schema.matches.id, matchId));
  assert.ok(player.discordUserId);
  await db
    .delete(schema.teamMemberships)
    .where(eq(schema.teamMemberships.discordUserId, player.discordUserId));
  const detail = await service.playerDetail(player.id);
  expect(detail.teams).toEqual([]);
  expect(detail.competition?.stats?.games).toBe(1);
  expect(detail.competition?.mvpMatchIds).toEqual([matchId]);
});
