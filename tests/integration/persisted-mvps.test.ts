import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { assert, expect, onTestFinished, test } from 'vitest';
import { CompetitionService } from '../../apps/api/src/modules/competition/competition.service.js';
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
