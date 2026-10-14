import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { assert, expect, onTestFinished, test } from 'vitest';
import { backfillMatchMvps } from '../../apps/api/src/modules/competition/backfill-match-mvps.js';
import * as schema from '../../packages/database/src/schema.js';

const matchId = '70000000-0000-4000-8000-000000000001';
async function setup() {
  const client = new PGlite({ extensions: { btree_gist } });
  onTestFinished(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
  });
  await client.exec(await readFile('packages/database/seed/demo.sql', 'utf8'));
  return { client, db };
}

test('backfill previews without writes, verifies both fields and preserves awards on rerun', async () => {
  const { db } = await setup();
  const before = await db.select().from(schema.matches);
  const preview = await backfillMatchMvps(db);
  expect(preview).toMatchObject({ total: 1, planned: 1, updated: 0, unresolved: 0 });
  expect(await db.select().from(schema.matches)).toEqual(before);
  const applied = await backfillMatchMvps(db, true);
  expect(applied).toMatchObject({ total: 1, updated: 1, unresolved: 0 });
  const award = applied.entries[0];
  assert.ok(award?.playerId && award.score);
  expect(award).toMatchObject({ ...preview.entries[0], status: 'updated' });
  const [saved] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
  expect(saved).toMatchObject({ mvpPlayerId: award.playerId, mvpScore: award.score });
  const [participant] = await db
    .select()
    .from(schema.playerGameInfo)
    .where(eq(schema.playerGameInfo.playerId, award.playerId));
  expect(participant?.teamId).toBe(saved?.winnerTeamId);
  await db.update(schema.playerGameStats).set({ kills: 0, assists: 0, damageToChampions: 0 });
  const rerun = await backfillMatchMvps(db, true);
  expect(rerun).toMatchObject({ updated: 0, preserved: 1, unresolved: 0 });
  expect(rerun.entries[0]).toMatchObject({ playerId: award.playerId, score: award.score });
});

test.each([
  ['DELETE FROM match_games', 'no_maps'],
  ['UPDATE match_games SET duration_seconds = NULL', 'unfinished_map_or_missing_duration'],
  ['UPDATE matches SET team1_score = 2', 'inconsistent_series_result'],
  ['DELETE FROM player_game_info', 'missing_participant_statistics'],
  ["UPDATE matches SET mvp_score = 100.0 WHERE status = 'completed'", 'partial_existing_award']
])('backfill reports incomplete history without guessing: %s', async (mutation, reason) => {
  const { client, db } = await setup();
  await client.exec(mutation);
  const before = await db.select().from(schema.matches);
  const result = await backfillMatchMvps(db, true);
  expect(result).toMatchObject({ updated: 0, unresolved: 1 });
  expect(result.entries[0]?.reason).toBe(reason);
  expect(await db.select().from(schema.matches)).toEqual(before);
});

test('concurrent backfills assign once and preserve the same award', async () => {
  const { db } = await setup();
  const results = await Promise.all([backfillMatchMvps(db, true), backfillMatchMvps(db, true)]);
  expect(results.reduce((count, result) => count + result.updated, 0)).toBe(1);
  expect(results.reduce((count, result) => count + result.preserved, 0)).toBe(1);
  expect(results[0]?.entries[0]?.playerId).toBe(results[1]?.entries[0]?.playerId);
  expect(results[0]?.entries[0]?.score).toBe(results[1]?.entries[0]?.score);
});

test('failed MVP writes roll back and can be retried', async () => {
  const { db, client } = await setup();
  await client.exec(`CREATE FUNCTION reject_backfill() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'test failure'; END $$;
    CREATE TRIGGER reject_backfill BEFORE UPDATE OF mvp_player_id ON matches
    FOR EACH ROW EXECUTE FUNCTION reject_backfill();`);
  expect(await backfillMatchMvps(db, true)).toMatchObject({
    unresolved: 1,
    updated: 0,
    entries: [{ matchId, reason: 'transaction_failed' }]
  });
  const [match] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
  expect(match).toMatchObject({ mvpPlayerId: null, mvpScore: null });
  await client.exec('DROP TRIGGER reject_backfill ON matches; DROP FUNCTION reject_backfill();');
  expect(await backfillMatchMvps(db, true)).toMatchObject({ updated: 1 });
});

test('backfill flags a stored winner absent from the series participants', async () => {
  const { db } = await setup();
  const applied = await backfillMatchMvps(db, true);
  const playerId = applied.entries[0]?.playerId;
  assert.ok(playerId);
  await db.delete(schema.playerGameInfo).where(eq(schema.playerGameInfo.playerId, playerId));
  const result = await backfillMatchMvps(db, true);
  expect(result).toMatchObject({ preserved: 0, unresolved: 1 });
  expect(result.entries[0]?.reason).toBe('existing_mvp_not_participant');
});

test('backfill continues with later series after a transaction fails', async () => {
  const { db, client } = await setup();
  const nextId = '70000000-0000-4000-8000-000000000002';
  const applied = await backfillMatchMvps(db, true);
  const playerId = applied.entries[0]?.playerId;
  assert.ok(playerId);
  // Move a valid awarded series behind the deliberately failing one in processing order.
  await db
    .update(schema.matches)
    .set({ status: 'completed', mvpPlayerId: playerId, mvpScore: '10.0' })
    .where(eq(schema.matches.id, nextId));
  const [map] = await db
    .select()
    .from(schema.matchGames)
    .where(eq(schema.matchGames.matchesId, matchId));
  const [participant] = await db
    .select()
    .from(schema.playerGameInfo)
    .where(eq(schema.playerGameInfo.playerId, playerId));
  assert.ok(map && participant);
  const mapId = crypto.randomUUID();
  await db
    .insert(schema.matchGames)
    .values({ ...map, id: mapId, matchesId: nextId, externalGameId: null });
  await db.transaction(async (tx) => {
    const id = crypto.randomUUID();
    await tx.insert(schema.playerGameInfo).values({ ...participant, id, matchGameId: mapId });
    for (const table of [schema.playerGameStats, schema.playerGameBuild, schema.playerGameRunes]) {
      const [record] = await tx.select().from(table).where(eq(table.id, participant.id));
      assert.ok(record);
      await tx.insert(table).values({ ...record, id });
    }
  });
  await db
    .update(schema.matches)
    .set({ mvpPlayerId: null, mvpScore: null })
    .where(eq(schema.matches.id, matchId));
  await client.exec(`CREATE FUNCTION reject_one_backfill() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id = '${matchId}' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_one_backfill BEFORE UPDATE OF mvp_player_id ON matches
    FOR EACH ROW EXECUTE FUNCTION reject_one_backfill();`);
  expect(await backfillMatchMvps(db, true)).toMatchObject({
    unresolved: 1,
    preserved: 1,
    entries: [
      { matchId, status: 'unresolved' },
      { matchId: nextId, status: 'preserved' }
    ]
  });
});
