import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { assert, expect, test } from 'vitest';
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
    kills: 3,
    deaths: 1,
    assists: 8,
    cs: 180,
    damageToChampions: 14200,
    visionScore: 22,
    extraStats: {
      doubleKills: 1,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      largestKillingSpree: 3,
      goldEarned: 11500,
      level: 14,
      damageTakenFromChampions: 9800,
      damageMitigated: 4200,
      crowdControlTime: 18,
      turretsKilled: 1,
      turretTakedowns: 2,
      inhibitorsKilled: 0,
      inhibitorTakedowns: 1,
      wardsPlaced: 12,
      wardsDestroyed: 3,
      controlWardsPurchased: 2,
      detectorWardsPlaced: 2,
      pings: 15,
      summonerSpell1Casts: 4,
      summonerSpell2Casts: 5,
      dragonsKilled: 2,
      baronsKilled: 0,
      riftHeraldsKilled: 1,
      voidGrubsKilled: 3,
      elderDragonsKilled: 0,
      objectivesStolen: 0,
      objectivesStolenAssists: 0,
      largestAbilityDamage: 1200,
      largestAttackDamage: 450,
      largestCriticalStrike: 0,
      longestTimeLiving: 900,
      timeSpentDead: 25,
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

test('PostgresRoflUploadRepository complete lifecycle and constraints', async (t) => {
  const client = new PGlite();
  t.onTestFinished(() => client.close());
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
  const [secondary] = await db
    .insert(schema.players)
    .values({
      discordUserId: '900000000000000001',
      gameName: 'Secondary Demo',
      riotTag: 'ALT',
      isMain: false
    })
    .returning();
  assert.ok(secondary);

  // secondary Riot IDs resolve to the main account and require a unique main
  {
    const identity = [{ gameName: 'secondary demo', riotTag: 'alt' }];
    const [main] = await repo.findPlayersByRiotIds([
      { gameName: 'Jugador Demo 1', riotTag: 'DEMO' }
    ]);
    const [alternate] = await repo.findPlayersByRiotIds(identity);
    assert.ok(main);
    assert.ok(alternate);
    expect(alternate.playerId).toBe(main.playerId);
    expect(alternate.gameName).toBe('Secondary Demo');
    expect(alternate.riotTag).toBe('ALT');
    await db
      .update(schema.players)
      .set({ isMain: false })
      .where(eq(schema.players.id, main.playerId));
    await expect(repo.findPlayersByRiotIds(identity)).rejects.toThrow(/exactly one main account/);
    await db
      .update(schema.players)
      .set({ isMain: true })
      .where(eq(schema.players.id, main.playerId));
    await db
      .update(schema.players)
      .set({ isMain: true })
      .where(eq(schema.players.id, secondary.id));
    await expect(repo.findPlayersByRiotIds(identity)).rejects.toThrow(/exactly one main account/);
    await db
      .update(schema.players)
      .set({ isMain: false })
      .where(eq(schema.players.id, secondary.id));
  }

  // findPlayersByRiotIds performs case-insensitive search and joins discord username
  {
    const found = await repo.findPlayersByRiotIds([
      { gameName: 'jugador demo 1', riotTag: 'demo' },
      { gameName: 'JUGADOR DEMO 2', riotTag: 'DEMO' },
      { gameName: 'NonExistent', riotTag: 'NONE' }
    ]);

    expect(found.length).toBe(2);
    const p1 = found.find((p) => p.gameName === 'Jugador Demo 1');
    assert.ok(p1);
    expect(p1.discordUsername).toBe('Jugador Discord DEMO 1');
    expect(p1.discordUserId).toBe('900000000000000001');

    const empty = await repo.findPlayersByRiotIds([]);
    expect(empty).toStrictEqual([]);
  }

  // checkExternalGamesExist returns only existing external IDs
  {
    const existing = await repo.checkExternalGamesExist(['DEMO-GAME-001', 'NON-EXISTENT-GAME-123']);
    expect(existing).toStrictEqual(['DEMO-GAME-001']);

    const empty = await repo.checkExternalGamesExist([]);
    expect(empty).toStrictEqual([]);
  }

  // findTeamMembershipsForDiscordUsers maps discord IDs to team UUIDs
  {
    const teamMap = await repo.findTeamMembershipsForDiscordUsers([
      '900000000000000001',
      '900000000000000006',
      '900000000000000099'
    ]);

    expect(teamMap.get('900000000000000001')).toBe('30000000-0000-4000-8000-000000000001');
    expect(teamMap.get('900000000000000006')).toBe('30000000-0000-4000-8000-000000000002');
    expect(teamMap.has('900000000000000099')).toBe(false);
  }

  // findMatchForTeams discovers scheduled match and weekly closed match
  {
    const team1Id = '30000000-0000-4000-8000-000000000001';
    const team2Id = '30000000-0000-4000-8000-000000000002';

    // Primary: finds Match 2 which is scheduled
    const openMatch = await repo.findMatchForTeams(team1Id, team2Id);
    assert.ok(openMatch);
    expect(openMatch.matchId).toBe('70000000-0000-4000-8000-000000000002');
    expect(openMatch.isClosed).toBe(false);

    // Secondary: with date of Match 1 week (2050-01-10), when no open match exists
    // Temporarily update Match 2 to completed to test secondary fallback
    await db
      .update(schema.matches)
      .set({ status: 'completed' })
      .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000002'));

    const closedMatch = await repo.findMatchForTeams(
      team1Id,
      team2Id,
      new Date('2050-01-10T19:00:00Z')
    );
    assert.ok(closedMatch);
    expect(closedMatch.matchId).toBe('70000000-0000-4000-8000-000000000001');
    expect(closedMatch.isClosed).toBe(true);

    // Two-sided buffer integration tests:
    // 1. Match scheduled on Friday of Round 1 (2050-01-14T18:00:00Z)
    // Replay played on Monday after (2050-01-17T12:00:00Z) resolves Match 1
    await db
      .update(schema.matches)
      .set({ scheduledAt: new Date('2050-01-14T18:00:00Z') })
      .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000001'));
    await db
      .update(schema.matches)
      .set({ scheduledAt: new Date('2050-01-21T18:00:00Z') })
      .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000002'));

    const mondayAfterMatch = await repo.findMatchForTeams(
      team1Id,
      team2Id,
      new Date('2050-01-17T12:00:00Z')
    );
    assert.ok(mondayAfterMatch);
    expect(mondayAfterMatch.matchId).toBe('70000000-0000-4000-8000-000000000001');
    expect(mondayAfterMatch.isClosed).toBe(true);

    // 2. Match scheduled on Friday of Round 2 (2050-01-21T18:00:00Z)
    // Replay played on Sunday before (2050-01-16T20:00:00Z) resolves Match 2
    await db
      .update(schema.matches)
      .set({ scheduledAt: new Date('2050-01-10T18:00:00Z') })
      .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000001'));

    const sundayBeforeMatch = await repo.findMatchForTeams(
      team1Id,
      team2Id,
      new Date('2050-01-16T20:00:00Z')
    );
    assert.ok(sundayBeforeMatch);
    expect(sundayBeforeMatch.matchId).toBe('70000000-0000-4000-8000-000000000002');
    expect(sundayBeforeMatch.isClosed).toBe(true);

    // Restore Match 1 and Match 2 to baseline values
    await db
      .update(schema.matches)
      .set({ scheduledAt: new Date('2050-01-10T18:00:00Z'), status: 'completed' })
      .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000001'));
    await db
      .update(schema.matches)
      .set({ scheduledAt: new Date('2050-01-17T18:00:00Z'), status: 'scheduled' })
      .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000002'));
  }

  // executeBatchInsert skips duplicate external_game_id and enforces unanimous membership
  {
    const allPlayers = await repo.findPlayersByRiotIds([
      ...Array.from({ length: 20 }, (_, i) => ({
        gameName: `Jugador Demo ${i + 1}`,
        riotTag: 'DEMO'
      })),
      { gameName: 'Secondary Demo', riotTag: 'ALT' }
    ]);
    const playerLookupMap = new Map<string, PlayerLookupResult>();
    for (const p of allPlayers) {
      playerLookupMap.set(`${p.gameName.toLowerCase()}#${p.riotTag.toLowerCase()}`, p);
    }
    const teamMap = await repo.findTeamMembershipsForDiscordUsers(
      allPlayers.map((p) => p.discordUserId)
    );

    // 1. Unanimous validation failure: participant from team 2 mixed into team 1
    const invalidParticipants: ParsedParticipantData[] = [
      createParticipant('Jugador Demo 1', 'DEMO', 'blue', 'Garen', 'top'),
      createParticipant('Jugador Demo 2', 'DEMO', 'blue', 'Vi', 'jungle'),
      createParticipant('Jugador Demo 3', 'DEMO', 'blue', 'Ahri', 'mid'),
      createParticipant('Jugador Demo 4', 'DEMO', 'blue', 'Jinx', 'adc'),
      // Player 6 belongs to Cuervos (team 2), NOT Lobos (team 1)
      createParticipant('Jugador Demo 6', 'DEMO', 'blue', 'Lulu', 'support'),
      createParticipant('Jugador Demo 7', 'DEMO', 'red', 'Ornn', 'top'),
      createParticipant('Jugador Demo 8', 'DEMO', 'red', 'LeeSin', 'jungle'),
      createParticipant('Jugador Demo 9', 'DEMO', 'red', 'Syndra', 'mid'),
      createParticipant('Jugador Demo 10', 'DEMO', 'red', 'Ashe', 'adc'),
      createParticipant('Jugador Demo 11', 'DEMO', 'red', 'Braum', 'support')
    ];

    const invalidGame: ParsedGameData = {
      fileName: 'invalid_team.rofl',
      externalGameId: 'EXT-INVALID-001',
      durationSeconds: 1600,
      winnerSide: 'blue',
      participants: invalidParticipants
    };

    await expect(
      repo.executeBatchInsert([invalidGame], playerLookupMap, teamMap)
    ).rejects.toSatisfy(
      (err: Error) =>
        /unanimous/i.test(err.message) &&
        /Roster breakdown:/i.test(err.message) &&
        /Jugador Demo 6#DEMO/.test(err.message)
    );

    // 2. Batch with 1 duplicate game ('DEMO-GAME-001') and 2 valid new games for Match 2 (best_of: 3)
    const validBlueParticipants: ParsedParticipantData[] = [
      createParticipant('Secondary Demo', 'ALT', 'blue', 'Garen', 'top'),
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

    const duplicateGame: ParsedGameData = {
      fileName: 'game_duplicate.rofl',
      externalGameId: 'DEMO-GAME-001', // already exists in demo.sql
      durationSeconds: 1800,
      winnerSide: 'blue',
      participants: [...validBlueParticipants, ...validRedParticipants]
    };

    const game1: ParsedGameData = {
      fileName: 'game_match2_g1.rofl',
      externalGameId: 'EXT-M2-G1',
      durationSeconds: 1950,
      winnerSide: 'blue', // blue is team 1 (Lobos)
      participants: [...validBlueParticipants, ...validRedParticipants]
    };

    const game2: ParsedGameData = {
      fileName: 'game_match2_g2.rofl',
      externalGameId: 'EXT-M2-G2',
      durationSeconds: 2100,
      winnerSide: 'blue', // blue is team 1 (Lobos) -> 2 wins, clinches best_of 3
      participants: [...validBlueParticipants, ...validRedParticipants]
    };

    // Execute batch insert: duplicate should be skipped, game1 and game2 inserted atomically
    await repo.executeBatchInsert([duplicateGame, game1, game2], playerLookupMap, teamMap);

    // Verify match_games count: original demo had 1, now should have 3
    const gamesInDb = await db.select().from(schema.matchGames);
    expect(gamesInDb.length).toBe(3);

    // Verify player info, stats, runes, build tables have 10 rows per game (demo had 10, now 30)
    const infos = await db.select().from(schema.playerGameInfo);
    expect(infos.length).toBe(30);
    const main = allPlayers.find((player) => player.gameName === 'Jugador Demo 1');
    assert.ok(main);
    expect(infos.filter((info) => info.playerId === secondary.id).length).toBe(0);
    expect(infos.filter((info) => info.playerId === main.playerId).length).toBe(3);
    const stats = await db.select().from(schema.playerGameStats);
    expect(stats.length).toBe(30);
    const runes = await db.select().from(schema.playerGameRunes);
    expect(runes.length).toBe(30);
    const builds = await db.select().from(schema.playerGameBuild);
    expect(builds.length).toBe(30);

    // Verify Match 2 scores and completed status
    const [match2] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000002'));
    assert.ok(match2);
    // In demo.sql: team1_id is Cuervos (team 2), team2_id is Lobos (team 1)
    // Blue winner was Lobos (team 1) -> so team2Score should be 2, team1Score should be 0
    expect(match2.team2Score).toBe(2);
    expect(match2.team1Score).toBe(0);
    expect(match2.status).toBe('completed');
    expect(match2.winnerTeamId).toBe('30000000-0000-4000-8000-000000000001');
    expect(match2.finishedAt).toBeTruthy();
  }
});

for (const individually of [true, false]) {
  test(`ROFL maps are ordered across ${individually ? 'individual uploads' : 'a batch'}`, async (t) => {
    const client = new PGlite();
    t.onTestFinished(() => client.close());
    const db = drizzle(client, { schema });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
    await client.exec(await readFile('packages/database/seed/demo.sql', 'utf8'));
    const matchId = '70000000-0000-4000-8000-000000000002';
    await db.update(schema.matches).set({ bestOf: 5 }).where(eq(schema.matches.id, matchId));
    const repo = new PostgresRoflUploadRepository(db);
    const players = await repo.findPlayersByRiotIds([
      { gameName: 'Jugador Demo 1', riotTag: 'DEMO' },
      { gameName: 'Jugador Demo 6', riotTag: 'DEMO' }
    ]);
    const lookup = new Map(
      players.map((player) => [
        `${player.gameName.toLowerCase()}#${player.riotTag.toLowerCase()}`,
        player
      ])
    );
    const teams = await repo.findTeamMembershipsForDiscordUsers(
      players.map((player) => player.discordUserId)
    );
    const games: ParsedGameData[] = [10, 2, 1].map((id) => ({
      fileName: `EUW1-${id}.rofl`,
      externalGameId: `EUW1-${id}`,
      durationSeconds: 1800,
      winnerSide: 'blue',
      participants: [
        createParticipant('Jugador Demo 1', 'DEMO', 'blue', 'Garen', 'top'),
        createParticipant('Jugador Demo 6', 'DEMO', 'red', 'Ornn', 'top')
      ]
    }));
    const read = () =>
      db
        .select()
        .from(schema.matchGames)
        .where(eq(schema.matchGames.matchesId, matchId))
        .orderBy(asc(schema.matchGames.gameNumber));
    let originalId: string | undefined;
    if (individually) {
      for (const game of games) {
        await repo.executeBatchInsert([game], lookup, teams);
        const rows = await read();
        const original = rows.find((row) => row.externalGameId === 'EUW1-10');
        if (originalId) expect(original?.id).toBe(originalId);
        else originalId = original?.id;
        expect(rows.map((row) => row.gameNumber)).toStrictEqual(rows.map((_, index) => index + 1));
      }
    } else await repo.executeBatchInsert(games, lookup, teams);
    const ordered = await read();
    expect(ordered.map((row) => row.externalGameId)).toStrictEqual(['EUW1-1', 'EUW1-2', 'EUW1-10']);
    expect(ordered.map((row) => row.gameNumber)).toStrictEqual([1, 2, 3]);
    for (const game of ordered) {
      const info = await db
        .select()
        .from(schema.playerGameInfo)
        .where(eq(schema.playerGameInfo.matchGameId, game.id));
      expect(info.length).toBe(2);
    }
    const duplicate = await repo.executeBatchInsert(games, lookup, teams);
    expect(duplicate.insertedGames).toBe(0);
    expect(duplicate.skippedDuplicates.length).toBe(3);
    expect(await read()).toStrictEqual(ordered);
    const [match] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
    expect(match?.team2Score).toBe(3);
    expect(match?.status).toBe('completed');
  });
}

test('concurrent ROFL batches sharing a replay report it as a duplicate', async (t) => {
  const client = new PGlite();
  t.onTestFinished(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
  });
  await client.exec(await readFile('packages/database/seed/demo.sql', 'utf8'));
  const matchId = '70000000-0000-4000-8000-000000000002';
  await db.update(schema.matches).set({ bestOf: 5 }).where(eq(schema.matches.id, matchId));
  const repo = new PostgresRoflUploadRepository(db);
  const players = await repo.findPlayersByRiotIds([
    { gameName: 'Jugador Demo 1', riotTag: 'DEMO' },
    { gameName: 'Jugador Demo 6', riotTag: 'DEMO' }
  ]);
  const lookup = new Map(
    players.map((player) => [
      `${player.gameName.toLowerCase()}#${player.riotTag.toLowerCase()}`,
      player
    ])
  );
  const teams = await repo.findTeamMembershipsForDiscordUsers(
    players.map((player) => player.discordUserId)
  );
  const game = (externalGameId: string): ParsedGameData => ({
    fileName: `${externalGameId}.rofl`,
    externalGameId,
    durationSeconds: 1800,
    winnerSide: 'blue',
    participants: [
      createParticipant('Jugador Demo 1', 'DEMO', 'blue', 'Garen', 'top'),
      createParticipant('Jugador Demo 6', 'DEMO', 'red', 'Ornn', 'top')
    ]
  });

  const results = await Promise.all([
    repo.executeBatchInsert([game('EUW1-SHARED'), game('EUW1-A')], lookup, teams),
    repo.executeBatchInsert([game('EUW1-SHARED'), game('EUW1-B')], lookup, teams)
  ]);

  expect(results.map((result) => result.insertedGames).sort()).toStrictEqual([1, 2]);
  expect(results.flatMap((result) => result.skippedDuplicates)).toStrictEqual(['EUW1-SHARED']);
  const rows = await db
    .select()
    .from(schema.matchGames)
    .where(eq(schema.matchGames.matchesId, matchId))
    .orderBy(asc(schema.matchGames.gameNumber));
  expect(rows.map((row) => row.externalGameId)).toStrictEqual(['EUW1-A', 'EUW1-B', 'EUW1-SHARED']);
  expect(rows.map((row) => row.gameNumber)).toStrictEqual([1, 2, 3]);
  const [match] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
  expect(match?.team2Score).toBe(3);
  expect(match?.status).toBe('completed');
});

test('a replay committed after the duplicate read is skipped when its match is closed', async (t) => {
  const client = new PGlite();
  t.onTestFinished(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
  });
  await client.exec(await readFile('packages/database/seed/demo.sql', 'utf8'));
  const matchId = '70000000-0000-4000-8000-000000000002';
  const repo = new PostgresRoflUploadRepository(db);
  const players = await repo.findPlayersByRiotIds([
    { gameName: 'Jugador Demo 1', riotTag: 'DEMO' },
    { gameName: 'Jugador Demo 6', riotTag: 'DEMO' }
  ]);
  const lookup = new Map(
    players.map((player) => [
      `${player.gameName.toLowerCase()}#${player.riotTag.toLowerCase()}`,
      player
    ])
  );
  const teams = await repo.findTeamMembershipsForDiscordUsers(
    players.map((player) => player.discordUserId)
  );
  const games: ParsedGameData[] = ['EUW1-1', 'EUW1-2'].map((externalGameId) => ({
    fileName: `${externalGameId}.rofl`,
    externalGameId,
    durationSeconds: 1800,
    winnerSide: 'blue',
    gameCreation: Date.parse('2050-01-17T19:00:00Z'),
    participants: [
      createParticipant('Jugador Demo 1', 'DEMO', 'blue', 'Garen', 'top'),
      createParticipant('Jugador Demo 6', 'DEMO', 'red', 'Ornn', 'top')
    ]
  }));
  await repo.executeBatchInsert(games, lookup, teams);

  // The first read misses the replays, as when another upload commits them right afterwards.
  class LateCommitRepository extends PostgresRoflUploadRepository {
    reads = 0;
    override async checkExternalGamesExist(
      ...args: Parameters<PostgresRoflUploadRepository['checkExternalGamesExist']>
    ) {
      this.reads += 1;
      return this.reads === 1 ? [] : super.checkExternalGamesExist(...args);
    }
  }
  const late = new LateCommitRepository(db);
  const result = await late.executeBatchInsert(games.slice(0, 1), lookup, teams);

  expect(result).toStrictEqual({ insertedGames: 0, skippedDuplicates: ['EUW1-1'] });
  const rows = await db
    .select()
    .from(schema.matchGames)
    .where(eq(schema.matchGames.matchesId, matchId));
  expect(rows.length).toBe(2);
});
