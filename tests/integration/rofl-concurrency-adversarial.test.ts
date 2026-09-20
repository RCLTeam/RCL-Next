import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { PostgresRoflUploadRepository } from '../../apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.js';
import type {
  ParsedGameData,
  ParsedParticipantData,
  PlayerLookupResult
} from '../../apps/api/src/modules/rofl-upload/types/rofl-upload.types.js';
import * as schema from '../../packages/database/src/schema.js';

function createParticipant(
  gameName: string,
  riotTag: string,
  side: 'blue' | 'red',
  champion: string,
  position: string
): ParsedParticipantData {
  return {
    gameName,
    riotTag,
    side,
    champion,
    position,
    kills: 4,
    deaths: 2,
    assists: 6,
    cs: 190,
    damageToChampions: 16000,
    visionScore: 25,
    extraStats: {
      doubleKills: 1,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      largestKillingSpree: 3,
      goldEarned: 12000,
      level: 14,
      damageTakenFromChampions: 10500,
      damageMitigated: 4800,
      crowdControlTime: 20,
      turretsKilled: 1,
      turretTakedowns: 2,
      inhibitorsKilled: 0,
      inhibitorTakedowns: 1,
      wardsPlaced: 14,
      wardsDestroyed: 4,
      controlWardsPurchased: 2,
      detectorWardsPlaced: 2,
      pings: 18,
      summonerSpell1Casts: 5,
      summonerSpell2Casts: 6,
      dragonsKilled: 2,
      baronsKilled: 1,
      riftHeraldsKilled: 1,
      voidGrubsKilled: 3,
      elderDragonsKilled: 0,
      objectivesStolen: 0,
      objectivesStolenAssists: 0,
      largestAbilityDamage: 1400,
      largestAttackDamage: 500,
      largestCriticalStrike: 0,
      longestTimeLiving: 850,
      timeSpentDead: 30,
      isMvp: false
    },
    runes: {
      primaryKeystoneId: 8010,
      primaryPerk: 8000,
      primaryPerk1: 9111,
      primaryPerk2: 9104,
      primaryPerk3: 8299,
      secundaryRuneId: 8400,
      secundaryPerk1: 8444,
      secundaryPerk2: 8451,
      statPerkOffense: 5005,
      statPerkFlex: 5008,
      statPerkDefense: 5001
    },
    build: {
      item0: 1001,
      item1: 1055,
      item2: 3006,
      item3: 0,
      item4: 0,
      item5: 0,
      trinket: 3340,
      summonerSpell1Id: 4,
      summonerSpell2Id: 12
    }
  };
}

test('Match series concurrency locking updates match scores and games without race conditions', async (t) => {
  const client = new PGlite();
  t.after(() => client.close());

  // Track queries executed within each transaction to verify lock ordering
  const txQueryLog: string[][] = [];
  const origTransaction = client.transaction.bind(client);
  type TxCallback = Parameters<typeof client.transaction>[0];
  type TxParam = Parameters<TxCallback>[0];
  client.transaction = async <T>(fn: (tx: TxParam) => Promise<T>): Promise<T> => {
    return origTransaction(async (txClient) => {
      const currentQueries: string[] = [];
      const origQuery = txClient.query.bind(txClient);
      txClient.query = (async (
        sql: string,
        params?: Parameters<typeof origQuery>[1],
        opts?: Parameters<typeof origQuery>[2]
      ) => {
        currentQueries.push(sql);
        return origQuery(sql, params, opts);
      }) as typeof origQuery;
      const result = await fn(txClient);
      txQueryLog.push(currentQueries);
      return result;
    });
  };

  const db = drizzle(client, { schema });
  const migrationsFolder = fileURLToPath(
    new URL('../../packages/database/drizzle', import.meta.url)
  );
  await migrate(db, { migrationsFolder });

  await client.transaction(async (tx) => {
    await tx.exec(
      await readFile(new URL('../../packages/database/seed/demo.sql', import.meta.url), 'utf8')
    );
  });

  // Clear query log from migrations and seed
  txQueryLog.length = 0;

  const repo = new PostgresRoflUploadRepository(db);

  const allPlayers = await repo.findPlayersByRiotIds(
    Array.from({ length: 20 }, (_, i) => ({
      gameName: `Jugador Demo ${i + 1}`,
      riotTag: 'DEMO'
    }))
  );
  const playerLookupMap = new Map<string, PlayerLookupResult>();
  for (const p of allPlayers) {
    playerLookupMap.set(`${p.gameName.toLowerCase()}#${p.riotTag.toLowerCase()}`, p);
  }
  const teamMap = await repo.findTeamMembershipsForDiscordUsers(
    allPlayers.map((p) => p.discordUserId)
  );

  const team1CuervosId = '30000000-0000-4000-8000-000000000002';
  const team2LobosId = '30000000-0000-4000-8000-000000000001';
  const match2Id = '70000000-0000-4000-8000-000000000002';

  // Blue team is Lobos (team2 in Match 2), Red team is Cuervos (team1 in Match 2)
  const validBlueParticipants: ParsedParticipantData[] = [
    createParticipant('Jugador Demo 1', 'DEMO', 'blue', 'Garen', 'top'),
    createParticipant('Jugador Demo 2', 'DEMO', 'blue', 'Vi', 'jungle'),
    createParticipant('Jugador Demo 3', 'DEMO', 'blue', 'Ahri', 'mid'),
    createParticipant('Jugador Demo 4', 'DEMO', 'blue', 'Jinx', 'adc'),
    createParticipant('Jugador Demo 5', 'DEMO', 'blue', 'Lulu', 'support')
  ];
  const validRedParticipants: ParsedParticipantData[] = [
    createParticipant('Jugador Demo 6', 'DEMO', 'red', 'Ornn', 'top'),
    createParticipant('Jugador Demo 7', 'DEMO', 'red', 'LeeSin', 'jungle'),
    createParticipant('Jugador Demo 8', 'DEMO', 'red', 'Syndra', 'mid'),
    createParticipant('Jugador Demo 9', 'DEMO', 'red', 'Ashe', 'adc'),
    createParticipant('Jugador Demo 10', 'DEMO', 'red', 'Braum', 'support')
  ];

  // Game 1 won by Blue (Lobos)
  const game1: ParsedGameData = {
    fileName: 'concurrent_game_1.rofl',
    externalGameId: 'CONCURRENCY-G1',
    durationSeconds: 1850,
    winnerSide: 'blue',
    participants: [...validBlueParticipants, ...validRedParticipants]
  };

  // Game 2 also won by Blue (Lobos) -> with bestOf: 3, 2 wins clinches the series
  const game2: ParsedGameData = {
    fileName: 'concurrent_game_2.rofl',
    externalGameId: 'CONCURRENCY-G2',
    durationSeconds: 2050,
    winnerSide: 'blue',
    participants: [...validBlueParticipants, ...validRedParticipants]
  };

  // Execute two concurrent batch inserts for the same scheduled match series
  const insertPromise1 = repo.executeBatchInsert([game1], playerLookupMap, teamMap);
  const insertPromise2 = repo.executeBatchInsert([game2], playerLookupMap, teamMap);

  const [res1, res2] = await Promise.all([insertPromise1, insertPromise2]);

  assert.equal(res1.insertedGames, 1);
  assert.equal(res2.insertedGames, 1);

  // Validate query ordering within transactions: row lock on matches MUST precede match_games query
  assert.equal(txQueryLog.length, 2, 'Expected 2 transactions for the 2 batch insert operations');
  for (const queries of txQueryLog) {
    const lockMatchIndex = queries.findIndex(
      (q) => /from "matches"/i.test(q) && /for update/i.test(q)
    );
    const queryMatchGamesIndex = queries.findIndex((q) => /from "match_games"/i.test(q));

    assert.ok(
      lockMatchIndex !== -1,
      'Transaction must execute SELECT ... FROM matches ... FOR UPDATE'
    );
    assert.ok(queryMatchGamesIndex !== -1, 'Transaction must execute SELECT ... FROM match_games');
    assert.ok(
      lockMatchIndex < queryMatchGamesIndex,
      `Pessimistic lock on matches (idx ${lockMatchIndex}) must precede match_games query (idx ${queryMatchGamesIndex})`
    );
  }

  // Query updated match from database
  const [updatedMatch] = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, match2Id));

  assert.ok(updatedMatch);
  assert.equal(updatedMatch.status, 'completed');
  // In Match 2: team1 is Cuervos (0 wins), team2 is Lobos (2 wins)
  assert.equal(updatedMatch.team1Score, 0);
  assert.equal(updatedMatch.team2Score, 2);
  assert.equal(updatedMatch.winnerTeamId, team2LobosId);

  // Verify match_games has exactly 2 games with distinct sequential numbers 1 and 2
  const insertedGamesInDb = await db
    .select()
    .from(schema.matchGames)
    .where(eq(schema.matchGames.matchesId, match2Id));

  assert.equal(insertedGamesInDb.length, 2);
  const gameNumbers = insertedGamesInDb.map((g) => g.gameNumber).sort((a, b) => a - b);
  assert.deepEqual(gameNumbers, [1, 2]);
});

test('Rejects uploads when match is already completed after acquiring lock', async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client, { schema });
  const migrationsFolder = fileURLToPath(
    new URL('../../packages/database/drizzle', import.meta.url)
  );
  await migrate(db, { migrationsFolder });

  await client.transaction(async (tx) => {
    await tx.exec(
      await readFile(new URL('../../packages/database/seed/demo.sql', import.meta.url), 'utf8')
    );
  });

  const repo = new PostgresRoflUploadRepository(db);

  const allPlayers = await repo.findPlayersByRiotIds(
    Array.from({ length: 20 }, (_, i) => ({
      gameName: `Jugador Demo ${i + 1}`,
      riotTag: 'DEMO'
    }))
  );
  const playerLookupMap = new Map<string, PlayerLookupResult>();
  for (const p of allPlayers) {
    playerLookupMap.set(`${p.gameName.toLowerCase()}#${p.riotTag.toLowerCase()}`, p);
  }
  const teamMap = await repo.findTeamMembershipsForDiscordUsers(
    allPlayers.map((p) => p.discordUserId)
  );

  const match2Id = '70000000-0000-4000-8000-000000000002';

  // Mark match 2 as completed
  await db
    .update(schema.matches)
    .set({ status: 'completed' })
    .where(eq(schema.matches.id, match2Id));

  const validBlueParticipants: ParsedParticipantData[] = [
    createParticipant('Jugador Demo 1', 'DEMO', 'blue', 'Garen', 'top'),
    createParticipant('Jugador Demo 2', 'DEMO', 'blue', 'Vi', 'jungle'),
    createParticipant('Jugador Demo 3', 'DEMO', 'blue', 'Ahri', 'mid'),
    createParticipant('Jugador Demo 4', 'DEMO', 'blue', 'Jinx', 'adc'),
    createParticipant('Jugador Demo 5', 'DEMO', 'blue', 'Lulu', 'support')
  ];
  const validRedParticipants: ParsedParticipantData[] = [
    createParticipant('Jugador Demo 6', 'DEMO', 'red', 'Ornn', 'top'),
    createParticipant('Jugador Demo 7', 'DEMO', 'red', 'LeeSin', 'jungle'),
    createParticipant('Jugador Demo 8', 'DEMO', 'red', 'Syndra', 'mid'),
    createParticipant('Jugador Demo 9', 'DEMO', 'red', 'Ashe', 'adc'),
    createParticipant('Jugador Demo 10', 'DEMO', 'red', 'Braum', 'support')
  ];

  const game: ParsedGameData = {
    fileName: 'late_game.rofl',
    externalGameId: 'LATE-G1',
    gameCreation: new Date('2050-01-17T20:00:00Z').getTime(),
    durationSeconds: 1500,
    winnerSide: 'blue',
    participants: [...validBlueParticipants, ...validRedParticipants]
  };

  await assert.rejects(repo.executeBatchInsert([game], playerLookupMap, teamMap), (err: Error) =>
    /completed\/closed/i.test(err.message)
  );
});

test('Directly demonstrates unique constraint violation when game numbers are resolved without row locking', async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client, { schema });
  const migrationsFolder = fileURLToPath(
    new URL('../../packages/database/drizzle', import.meta.url)
  );
  await migrate(db, { migrationsFolder });

  await client.transaction(async (tx) => {
    await tx.exec(
      await readFile(new URL('../../packages/database/seed/demo.sql', import.meta.url), 'utf8')
    );
  });

  const matchId = '70000000-0000-4000-8000-000000000002';

  // Simulate two concurrent reads without row lock: both see 0 games and determine nextGameNumber = 1
  const existingGames1 = await db
    .select({ gameNumber: schema.matchGames.gameNumber })
    .from(schema.matchGames)
    .where(eq(schema.matchGames.matchesId, matchId));
  const nextNum1 =
    (existingGames1.length === 0 ? 0 : Math.max(...existingGames1.map((g) => g.gameNumber))) + 1;

  const existingGames2 = await db
    .select({ gameNumber: schema.matchGames.gameNumber })
    .from(schema.matchGames)
    .where(eq(schema.matchGames.matchesId, matchId));
  const nextNum2 =
    (existingGames2.length === 0 ? 0 : Math.max(...existingGames2.map((g) => g.gameNumber))) + 1;

  assert.equal(nextNum1, 1);
  assert.equal(nextNum2, 1);

  // First insert succeeds with gameNumber 1
  await db.insert(schema.matchGames).values({
    id: crypto.randomUUID(),
    matchesId: matchId,
    gameNumber: nextNum1,
    blueTeamId: '30000000-0000-4000-8000-000000000001',
    redTeamId: '30000000-0000-4000-8000-000000000002',
    winnerTeamId: '30000000-0000-4000-8000-000000000001',
    durationSeconds: 1500
  });

  // Second insert with duplicate gameNumber fails with unique constraint violation
  await assert.rejects(
    db.insert(schema.matchGames).values({
      id: crypto.randomUUID(),
      matchesId: matchId,
      gameNumber: nextNum2,
      blueTeamId: '30000000-0000-4000-8000-000000000001',
      redTeamId: '30000000-0000-4000-8000-000000000002',
      winnerTeamId: '30000000-0000-4000-8000-000000000001',
      durationSeconds: 1600
    }),
    (err: unknown) => {
      const errorObj = err as { message?: string; cause?: { message?: string } };
      return (
        /unique constraint/i.test(errorObj.message ?? '') ||
        /unique constraint/i.test(errorObj.cause?.message ?? '') ||
        /duplicate key/i.test(errorObj.message ?? '') ||
        /duplicate key/i.test(errorObj.cause?.message ?? '')
      );
    }
  );
});
