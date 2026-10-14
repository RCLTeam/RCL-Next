import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { assert, expect, onTestFinished, test } from 'vitest';
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
