import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { RoflUploadRepository } from './persistence/rofl-upload.repository.js';
import {
  MAX_PARSER_CONCURRENCY,
  executePythonParser,
  validateParserFileCounts
} from './processing/execute-python-parser.js';
import {
  cleanupTempDir,
  createZipArchive,
  decompressionQueue,
  processBatchFiles,
  validateZipSlip
} from './processing/process-batch-files.js';
import {
  sortGamesChronologically,
  transformParserJson,
  transformSingleParserJson
} from './processing/transform-parser-json.js';
import type {
  ParsedGameData,
  ParsedParticipantData,
  PlayerLookupResult
} from './types/rofl-upload.types.js';
import { detectMultiAccountAnomalies } from './validation/detect-multi-account-anomalies.js';
import { validateParticipantCache } from './validation/validate-participant-cache.js';

function createDummyParticipant(
  gameName: string,
  riotTag: string,
  champion = 'Ahri',
  side: 'blue' | 'red' = 'blue'
): ParsedParticipantData {
  return {
    gameName,
    riotTag,
    side,
    champion,
    position: 'MID',
    kills: 5,
    deaths: 1,
    assists: 7,
    cs: 200,
    damageToChampions: 15000,
    visionScore: 20,
    extraStats: {
      doubleKills: 1,
      goldEarned: 12000,
      level: 15,
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
      item0: 1055,
      item1: 3006,
      item2: 0,
      item3: 0,
      item4: 0,
      item5: 0,
      trinket: 3340,
      summonerSpell1Id: 4,
      summonerSpell2Id: 12
    }
  };
}

test('validateParticipantCache throws error when players are missing in database', async () => {
  const fakeRepo: RoflUploadRepository = {
    async findPlayersByRiotIds() {
      return [];
    },
    async checkExternalGamesExist() {
      return [];
    },
    async findTeamMembershipsForDiscordUsers() {
      return new Map();
    },
    async findMatchForTeams() {
      return null;
    },
    async executeBatchInsert() {
      return { insertedGames: 0, skippedDuplicates: [] };
    }
  };

  const fakeGame: ParsedGameData = {
    fileName: 'test.rofl',
    externalGameId: 'TEST-1',
    durationSeconds: 1500,
    winnerSide: 'blue',
    participants: [createDummyParticipant('Faker', 'KR1')]
  };

  await assert.rejects(
    async () => validateParticipantCache([fakeGame], fakeRepo),
    (err: Error) => {
      assert.match(err.message, /Faker#KR1/);
      assert.match(err.message, /not registered/i);
      return true;
    }
  );
});

test('validateParticipantCache succeeds and populates cache when all summoners exist', async () => {
  const fakeRepo: RoflUploadRepository = {
    async findPlayersByRiotIds(riotIds) {
      return riotIds.map((r, i) => ({
        playerId: `player-uuid-${i}`,
        discordUserId: `discord-id-${i}`,
        discordUsername: `user_${i}`,
        gameName: r.gameName,
        riotTag: r.riotTag
      }));
    },
    async checkExternalGamesExist() {
      return [];
    },
    async findTeamMembershipsForDiscordUsers() {
      return new Map();
    },
    async findMatchForTeams() {
      return null;
    },
    async executeBatchInsert() {
      return { insertedGames: 0, skippedDuplicates: [] };
    }
  };

  const fakeGame: ParsedGameData = {
    fileName: 'test.rofl',
    externalGameId: 'TEST-1',
    durationSeconds: 1500,
    winnerSide: 'blue',
    participants: [createDummyParticipant('Caps', 'EUW'), createDummyParticipant('Jankos', 'EUW')]
  };

  const cache = await validateParticipantCache([fakeGame], fakeRepo);
  assert.equal(cache.size, 2);
  assert.ok(cache.has('caps#euw'));
  assert.ok(cache.has('jankos#euw'));
  assert.equal(cache.get('caps#euw')?.discordUsername, 'user_0');
});

test('detectMultiAccountAnomalies identifies multiple accounts by same Discord user', () => {
  const playerCache = new Map<string, PlayerLookupResult>([
    [
      'main#euw',
      {
        playerId: 'p1',
        discordUserId: 'u1',
        discordUsername: 'User1',
        gameName: 'Main',
        riotTag: 'EUW'
      }
    ],
    [
      'smurf#euw',
      {
        playerId: 'p2',
        discordUserId: 'u1',
        discordUsername: 'User1',
        gameName: 'Smurf',
        riotTag: 'EUW'
      }
    ]
  ]);

  const fakeGame: ParsedGameData = {
    fileName: 'match.rofl',
    externalGameId: 'M1',
    durationSeconds: 1200,
    winnerSide: 'blue',
    participants: [
      createDummyParticipant('Main', 'EUW', 'Ahri', 'blue'),
      createDummyParticipant('Smurf', 'EUW', 'Garen', 'blue')
    ]
  };

  const anomalies = detectMultiAccountAnomalies([fakeGame], playerCache);
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0]?.discordUserId, 'u1');
  assert.equal(anomalies[0]?.discordUsername, 'User1');
  assert.equal(anomalies[0]?.accounts.length, 2);
  assert.equal(anomalies[0]?.accounts[0]?.account, 'Main#EUW');
  assert.equal(anomalies[0]?.accounts[0]?.champion, 'Ahri');
  assert.equal(anomalies[0]?.accounts[1]?.account, 'Smurf#EUW');
  assert.equal(anomalies[0]?.accounts[1]?.champion, 'Garen');
});

test('detectMultiAccountAnomalies returns empty array when all players have distinct Discord IDs', () => {
  const playerCache = new Map<string, PlayerLookupResult>([
    [
      'player1#euw',
      {
        playerId: 'p1',
        discordUserId: 'u1',
        discordUsername: 'User1',
        gameName: 'Player1',
        riotTag: 'EUW'
      }
    ],
    [
      'player2#euw',
      {
        playerId: 'p2',
        discordUserId: 'u2',
        discordUsername: 'User2',
        gameName: 'Player2',
        riotTag: 'EUW'
      }
    ]
  ]);

  const fakeGame: ParsedGameData = {
    fileName: 'match.rofl',
    externalGameId: 'M1',
    durationSeconds: 1200,
    winnerSide: 'blue',
    participants: [
      createDummyParticipant('Player1', 'EUW', 'Ahri', 'blue'),
      createDummyParticipant('Player2', 'EUW', 'Garen', 'red')
    ]
  };

  const anomalies = detectMultiAccountAnomalies([fakeGame], playerCache);
  assert.equal(anomalies.length, 0);
});

test('transformParserJson maps raw parser JSON into strongly typed ParsedGameData', () => {
  const sampleRawJson = {
    fuente: {
      archivo: 'EUW1-123456789.rofl'
    },
    partida: {
      duracion: 1800,
      equipo_ganador: 100
    },
    jugadores: [
      {
        nombre: 'Showmaker',
        tag: 'DK',
        puuid: 'uuid-mid',
        campeon: 'Syndra',
        posicion: 'MID',
        equipo: 100,
        kda: {
          kills: 8,
          muertes: 2,
          asistencias: 10,
          double_kills: 2,
          triple_kills: 0,
          quadra_kills: 0,
          penta_kills: 0,
          largest_killing_spree: 4
        },
        oro: 15400,
        cs: 260,
        nivel: 16,
        daño_campeones: 24500,
        daño_recibido_campeones: 12000,
        soporte: {
          daño_mitigado: 5000,
          control_adversarios: 42
        },
        estructuras: {
          torres: 3,
          derribos_torres: 4,
          inhibidores: 1,
          derribos_inhibidores: 1
        },
        vision: {
          score: 35,
          wards_colocados: 14,
          wards_destruidos: 6,
          pinkwards_comprados: 3,
          wards_detector: 3
        },
        pings: 25,
        runas: {
          primaria: {
            estilo_id: 8100,
            keystone_id: 8112,
            runa_1_id: 8126,
            runa_2_id: 8138,
            runa_3_id: 8135
          },
          secundaria: {
            estilo_id: 8200,
            runa_1_id: 8226,
            runa_2_id: 8210
          },
          fragmentos: {
            ofensiva_id: 5008,
            flexible_id: 5008,
            defensiva_id: 5001
          }
        },
        objetos: {
          slots: [
            { slot: 0, id: 6655 },
            { slot: 1, id: 3020 },
            { slot: 2, id: 3089 },
            { slot: 3, id: 3157 },
            { slot: 4, id: 0 },
            { slot: 5, id: 0 },
            { slot: 6, id: 3364 }
          ]
        },
        hechizos: {
          hechizo_1_id: 4,
          hechizo_2_id: 14,
          casts_1: 5,
          casts_2: 6
        }
      }
    ]
  };

  const parsed = transformSingleParserJson(sampleRawJson, 'EUW1-123456789_estadisticas.json');
  assert.equal(parsed.fileName, 'EUW1-123456789.rofl');
  assert.equal(parsed.externalGameId, 'EUW1-123456789');
  assert.equal(parsed.durationSeconds, 1800);
  assert.equal(parsed.winnerSide, 'blue');
  assert.equal(parsed.participants.length, 1);

  const p = parsed.participants[0];
  assert.ok(p);
  assert.equal(p.gameName, 'Showmaker');
  assert.equal(p.riotTag, 'DK');
  assert.equal(p.side, 'blue');
  assert.equal(p.champion, 'Syndra');
  assert.equal(p.position, 'MID');
  assert.equal(p.kills, 8);
  assert.equal(p.deaths, 2);
  assert.equal(p.assists, 10);
  assert.equal(p.cs, 260);
  assert.equal(p.damageToChampions, 24500);
  assert.equal(p.visionScore, 35);
  assert.equal(p.runes.primaryKeystoneId, 8112);
  assert.equal(p.build.item0, 6655);
  assert.equal(p.build.trinket, 3364);
  assert.equal(p.build.summonerSpell1Id, 4);
  assert.equal(p.build.summonerSpell2Id, 14);
  assert.equal(p.extraStats.doubleKills, 2);
  assert.equal(p.extraStats.goldEarned, 15400);
});

test('sortGamesChronologically orders games sequence properly', () => {
  const g1: ParsedGameData = {
    fileName: 'match_game_1.rofl',
    externalGameId: 'G1',
    durationSeconds: 1500,
    winnerSide: 'blue',
    participants: [],
    gameCreation: 1000
  };
  const g2: ParsedGameData = {
    fileName: 'match_game_2.rofl',
    externalGameId: 'G2',
    durationSeconds: 1600,
    winnerSide: 'red',
    participants: [],
    gameCreation: 2000
  };
  const g3: ParsedGameData = {
    fileName: 'match_game_10.rofl',
    externalGameId: 'G10',
    durationSeconds: 1700,
    winnerSide: 'blue',
    participants: [],
    gameCreation: 3000
  };

  const sorted = sortGamesChronologically([g3, g1, g2]);
  assert.equal(sorted[0]?.fileName, 'match_game_1.rofl');
  assert.equal(sorted[1]?.fileName, 'match_game_2.rofl');
  assert.equal(sorted[2]?.fileName, 'match_game_10.rofl');
});

test('validateParserFileCounts strictly enforces N_json == N_rofl', () => {
  assert.doesNotThrow(() => validateParserFileCounts(3, 3));
  assert.throws(
    () => validateParserFileCounts(3, 2),
    /Parser output count mismatch: expected 3 JSON files, but got 2/
  );
  const expectedCap = Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1);
  assert.equal(MAX_PARSER_CONCURRENCY, expectedCap);
  assert.ok(MAX_PARSER_CONCURRENCY >= 1);
});

test('zip-slip protection rejects path traversal', () => {
  const baseDir = '/tmp/safe-dir';
  assert.throws(() => validateZipSlip(baseDir, '../../etc/passwd'), /Zip slip security violation/);
  assert.throws(() => validateZipSlip(baseDir, '../escape.rofl'), /Zip slip security violation/);
  assert.doesNotThrow(() => {
    const valid = validateZipSlip(baseDir, 'replays/game1.rofl');
    assert.equal(valid, path.resolve(baseDir, 'replays/game1.rofl'));
  });
});

test('processBatchFiles handles single .rofl file and bypasses queue', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rofl-test-'));
  t.after(async () => {
    await cleanupTempDir(tempDir);
  });

  const sampleRofl = path.join(tempDir, 'single_match.rofl');
  await fs.writeFile(sampleRofl, 'RIOT_SAMPLE_BYTES');

  let queueCalled = false;
  const result = await processBatchFiles({
    sourceFilePath: sampleRofl,
    originalFileName: 'single_match.rofl',
    onQueueStatus: () => {
      queueCalled = true;
    }
  });

  t.after(async () => {
    await cleanupTempDir(result.tempDir);
  });

  // Single rofl bypasses queue
  assert.equal(queueCalled, false);
  const roflFilePath = result.roflFilePaths[0];
  assert.ok(roflFilePath);
  assert.ok(roflFilePath.endsWith('single_match.rofl'));
  const content = await fs.readFile(roflFilePath, 'utf8');
  assert.equal(content, 'RIOT_SAMPLE_BYTES');
});

test('processBatchFiles unpacks zip and respects zip-slip protection', async (t) => {
  const tempTestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-test-'));
  t.after(async () => {
    await cleanupTempDir(tempTestDir);
  });

  // 1. Valid zip with .rofl files
  const validZipPath = path.join(tempTestDir, 'valid.zip');
  const validZipBuffer = createZipArchive([
    { name: 'game1.rofl', content: 'ROFL_1' },
    { name: 'subfolder/game2.rofl', content: 'ROFL_2' }
  ]);
  await fs.writeFile(validZipPath, validZipBuffer);

  let queuePosition = 0;
  let queueTotal = 0;
  const validResult = await processBatchFiles({
    sourceFilePath: validZipPath,
    originalFileName: 'valid.zip',
    onQueueStatus: (pos, total) => {
      queuePosition = pos;
      queueTotal = total;
    }
  });

  t.after(async () => {
    await cleanupTempDir(validResult.tempDir);
  });

  assert.equal(queuePosition, 1);
  assert.equal(queueTotal, 1);
  assert.equal(validResult.roflFilePaths.length, 2);

  // 2. Zip with malicious zip-slip traversal entry
  const maliciousZipPath = path.join(tempTestDir, 'malicious.zip');
  const maliciousZipBuffer = createZipArchive([{ name: '../../../evil.rofl', content: 'EVIL' }]);
  await fs.writeFile(maliciousZipPath, maliciousZipBuffer);

  await assert.rejects(
    async () =>
      processBatchFiles({
        sourceFilePath: maliciousZipPath,
        originalFileName: 'malicious.zip'
      }),
    /Zip slip security violation/
  );
});

test('DecompressionQueue enforces concurrency 1 and FIFO ordering', async () => {
  decompressionQueue.reset();

  const events: string[] = [];
  const task1Release = await decompressionQueue.acquire((pos, total) => {
    events.push(`task1-pos-${pos}-tot-${total}`);
  });

  // Task 2 arrives while task 1 is running
  const task2Promise = decompressionQueue.acquire((pos, total) => {
    events.push(`task2-pos-${pos}-tot-${total}`);
  });

  // Task 3 arrives while task 1 is running
  const task3Promise = decompressionQueue.acquire((pos, total) => {
    events.push(`task3-pos-${pos}-tot-${total}`);
  });

  assert.equal(decompressionQueue.getQueueLength(), 2);
  assert.ok(events.includes('task1-pos-1-tot-1'));
  assert.ok(events.includes('task2-pos-2-tot-2'));
  assert.ok(events.includes('task3-pos-3-tot-3'));

  // Release task 1 -> task 2 runs
  task1Release();
  const task2Release = await task2Promise;
  assert.ok(events.includes('task2-pos-1-tot-2'));

  // Release task 2 -> task 3 runs
  task2Release();
  const task3Release = await task3Promise;
  assert.ok(events.includes('task3-pos-1-tot-1'));

  task3Release();
  assert.equal(decompressionQueue.isBusy(), false);
  assert.equal(decompressionQueue.getQueueLength(), 0);
});

test('executePythonParser processes real ROFL file and emits progress', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parser-exec-test-'));
  t.after(async () => {
    await cleanupTempDir(tempDir);
  });

  const fixtureRofl = path.resolve('apps/parser/data/EUW1-7982902321.rofl');
  const progressCalls: Array<{ count: number; total: number; file: string }> = [];

  const result = await executePythonParser({
    roflFilePaths: [fixtureRofl],
    outputDir: tempDir,
    onProgress: (count, total, file) => {
      progressCalls.push({ count, total, file });
    }
  });

  assert.equal(result.jsonFilePaths.length, 1);
  assert.equal(progressCalls.length, 1);
  assert.equal(progressCalls[0]?.count, 1);
  assert.equal(progressCalls[0]?.total, 1);

  const transformedGames = await transformParserJson(result.jsonFilePaths);
  assert.equal(transformedGames.length, 1);
  const game = transformedGames[0];
  assert.ok(game);
  assert.equal(game.fileName, 'EUW1-7982902321.rofl');
  assert.equal(game.externalGameId, 'EUW1-7982902321');
  assert.equal(game.participants.length, 10);
  assert.equal(game.participants.filter((p) => p.side === 'blue').length, 5);
  assert.equal(game.participants.filter((p) => p.side === 'red').length, 5);
});

test('executePythonParser throws error when ROFL file is missing', async () => {
  await assert.rejects(
    async () =>
      executePythonParser({
        roflFilePaths: ['/nonexistent/path/missing.rofl']
      }),
    /Failed to parse ROFL file/
  );
});

test('executePythonParser skips files with invalid magic header (code 11) and emits warning', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parser-resilience-test-'));
  t.after(async () => {
    await cleanupTempDir(tempDir);
  });

  const fixtureRofl = path.resolve('apps/parser/data/EUW1-7982902321.rofl');
  const fakeRofl = path.join(tempDir, 'fake_invalid_magic.rofl');
  await fs.writeFile(fakeRofl, 'NOT_RIOT_MAGIC_HEADER_SAMPLE');

  const warnings: string[] = [];
  const result = await executePythonParser({
    roflFilePaths: [fakeRofl, fixtureRofl],
    outputDir: tempDir,
    onWarning: (msg) => {
      warnings.push(msg);
    }
  });

  assert.equal(result.jsonFilePaths.length, 1);
  assert.equal(result.validRoflCount, 1);
  assert.equal(result.skippedFiles.length, 1);
  assert.equal(result.skippedFiles[0], fakeRofl);
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0] ?? '',
    /El archivo 'fake_invalid_magic\.rofl' no tiene la cabecera ROFL válida y ha sido omitido/
  );
});

test('executePythonParser cleanly aborts when 0 valid ROFL files remain in batch', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parser-zero-valid-test-'));
  t.after(async () => {
    await cleanupTempDir(tempDir);
  });

  const fakeRofl1 = path.join(tempDir, 'fake1.rofl');
  const fakeRofl2 = path.join(tempDir, 'fake2.rofl');
  await fs.writeFile(fakeRofl1, 'NOT_RIOT_1');
  await fs.writeFile(fakeRofl2, 'NOT_RIOT_2');

  const warnings: string[] = [];
  await assert.rejects(
    async () =>
      executePythonParser({
        roflFilePaths: [fakeRofl1, fakeRofl2],
        outputDir: tempDir,
        onWarning: (msg) => {
          warnings.push(msg);
        }
      }),
    /No valid ROFL files found in batch/
  );

  assert.equal(warnings.length, 2);
  assert.ok(
    warnings.some((w) =>
      /El archivo 'fake1\.rofl' no tiene la cabecera ROFL válida y ha sido omitido/.test(w)
    ),
    'Expected warning for fake1.rofl'
  );
  assert.ok(
    warnings.some((w) =>
      /El archivo 'fake2\.rofl' no tiene la cabecera ROFL válida y ha sido omitido/.test(w)
    ),
    'Expected warning for fake2.rofl'
  );
});
