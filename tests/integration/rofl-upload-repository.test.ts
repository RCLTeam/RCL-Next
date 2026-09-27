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

  await t.test(
    'findPlayersByRiotIds performs case-insensitive search and joins discord username',
    async () => {
      const found = await repo.findPlayersByRiotIds([
        { gameName: 'jugador demo 1', riotTag: 'demo' },
        { gameName: 'JUGADOR DEMO 2', riotTag: 'DEMO' },
        { gameName: 'NonExistent', riotTag: 'NONE' }
      ]);

      assert.equal(found.length, 2);
      const p1 = found.find((p) => p.gameName === 'Jugador Demo 1');
      assert.ok(p1);
      assert.equal(p1.discordUsername, 'Jugador Discord DEMO 1');
      assert.equal(p1.discordUserId, '900000000000000001');

      const empty = await repo.findPlayersByRiotIds([]);
      assert.deepEqual(empty, []);
    }
  );

  await t.test('checkExternalGamesExist returns only existing external IDs', async () => {
    const existing = await repo.checkExternalGamesExist(['DEMO-GAME-001', 'NON-EXISTENT-GAME-123']);
    assert.deepEqual(existing, ['DEMO-GAME-001']);

    const empty = await repo.checkExternalGamesExist([]);
    assert.deepEqual(empty, []);
  });

  await t.test('findTeamMembershipsForDiscordUsers maps discord IDs to team UUIDs', async () => {
    const teamMap = await repo.findTeamMembershipsForDiscordUsers([
      '900000000000000001',
      '900000000000000006',
      '900000000000000099'
    ]);

    assert.equal(teamMap.get('900000000000000001'), '30000000-0000-4000-8000-000000000001');
    assert.equal(teamMap.get('900000000000000006'), '30000000-0000-4000-8000-000000000002');
    assert.equal(teamMap.has('900000000000000099'), false);
  });

  await t.test('findMatchForTeams discovers scheduled match and weekly closed match', async () => {
    const team1Id = '30000000-0000-4000-8000-000000000001';
    const team2Id = '30000000-0000-4000-8000-000000000002';

    // Primary: finds Match 2 which is scheduled
    const openMatch = await repo.findMatchForTeams(team1Id, team2Id);
    assert.ok(openMatch);
    assert.equal(openMatch.matchId, '70000000-0000-4000-8000-000000000002');
    assert.equal(openMatch.isClosed, false);

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
    assert.equal(closedMatch.matchId, '70000000-0000-4000-8000-000000000001');
    assert.equal(closedMatch.isClosed, true);

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
    assert.equal(mondayAfterMatch.matchId, '70000000-0000-4000-8000-000000000001');
    assert.equal(mondayAfterMatch.isClosed, true);

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
    assert.equal(sundayBeforeMatch.matchId, '70000000-0000-4000-8000-000000000002');
    assert.equal(sundayBeforeMatch.isClosed, true);

    // Restore Match 1 and Match 2 to baseline values
    await db
      .update(schema.matches)
      .set({ scheduledAt: new Date('2050-01-10T18:00:00Z'), status: 'completed' })
      .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000001'));
    await db
      .update(schema.matches)
      .set({ scheduledAt: new Date('2050-01-17T18:00:00Z'), status: 'scheduled' })
      .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000002'));
  });

  await t.test(
    'executeBatchInsert skips duplicate external_game_id and enforces unanimous membership',
    async () => {
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

      await assert.rejects(
        repo.executeBatchInsert([invalidGame], playerLookupMap, teamMap),
        (err: Error) =>
          /unanimous/i.test(err.message) &&
          /Roster breakdown:/i.test(err.message) &&
          /Jugador Demo 6#DEMO/.test(err.message)
      );

      // 2. Batch with 1 duplicate game ('DEMO-GAME-001') and 2 valid new games for Match 2 (best_of: 3)
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
      assert.equal(gamesInDb.length, 3);

      // Verify player info, stats, runes, build tables have 10 rows per game (demo had 10, now 30)
      const infos = await db.select().from(schema.playerGameInfo);
      assert.equal(infos.length, 30);
      const stats = await db.select().from(schema.playerGameStats);
      assert.equal(stats.length, 30);
      const runes = await db.select().from(schema.playerGameRunes);
      assert.equal(runes.length, 30);
      const builds = await db.select().from(schema.playerGameBuild);
      assert.equal(builds.length, 30);

      // Verify Match 2 scores and completed status
      const [match2] = await db
        .select()
        .from(schema.matches)
        .where(eq(schema.matches.id, '70000000-0000-4000-8000-000000000002'));
      assert.ok(match2);
      // In demo.sql: team1_id is Cuervos (team 2), team2_id is Lobos (team 1)
      // Blue winner was Lobos (team 1) -> so team2Score should be 2, team1Score should be 0
      assert.equal(match2.team2Score, 2);
      assert.equal(match2.team1Score, 0);
      assert.equal(match2.status, 'completed');
      assert.equal(match2.winnerTeamId, '30000000-0000-4000-8000-000000000001');
      assert.ok(match2.finishedAt);
    }
  );
});
