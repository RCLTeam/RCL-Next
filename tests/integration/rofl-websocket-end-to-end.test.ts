import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { WsServerEvent } from '@rcl/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { WebSocket } from 'ws';
import { createApp } from '../../apps/api/src/app.js';
import type { CompetitionRepository } from '../../apps/api/src/modules/competition/competition.repository.js';
import { PostgresRoflUploadRepository } from '../../apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.js';
import { createZipArchive } from '../../apps/api/src/modules/rofl-upload/processing/process-batch-files.js';

import { attachRoflUploadGateway } from '../../apps/api/src/modules/rofl-upload/websocket/rofl-upload.gateway.js';
import * as schema from '../../packages/database/src/schema.js';

const fixtureRoflPath = path.resolve('apps/parser/data/EUW1-7982902321.rofl');

const mockCompetitionRepo: CompetitionRepository = {
  players: async () => [],
  playerDetail: async () => undefined,
  matchDirectory: async () => [],
  match: async () => undefined,
  matchGames: async () => [],
  championPicks: async () => [],
  teamDirectory: async () => [],
  teamDetail: async () => undefined,
  seasons: async () => [],
  season: async () => undefined,
  divisions: async () => [],
  division: async () => undefined,
  teams: async () => [],
  rounds: async () => [],
  matches: async () => []
};

const bluePlayers = [
  { name: 'Iron Tou', tag: 'EUW' },
  { name: 'Melintavahalma', tag: '8835' },
  { name: 'Mystery Shack', tag: 'EUW7' },
  { name: 'Kento', tag: 'ROUX' },
  { name: 'Gaby', tag: 'GoT' }
];

const redPlayers = [
  { name: 'Meuleur Teigneux', tag: 'EUW' },
  { name: 'Heinben', tag: 'EUW' },
  { name: 'Hysbel', tag: 'EUW' },
  { name: 'Jonibaba71', tag: '2277' },
  { name: 'BigNikEnergy', tag: 'VEINY' }
];

async function setupTestDb() {
  const client = new PGlite();
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
  return { client, db };
}

async function registerAllPlayers(
  db: ReturnType<typeof drizzle>,
  options?: { shareDiscordId?: boolean }
) {
  for (let i = 0; i < bluePlayers.length; i++) {
    const p = bluePlayers[i];
    if (!p) continue;
    const suffix = String(i + 1).padStart(12, '0');
    const discordUserId =
      options?.shareDiscordId && i === 1 ? '900000000000000001' : `90000000000000000${i + 1}`;
    await db
      .update(schema.players)
      .set({
        gameName: p.name,
        riotTag: p.tag,
        discordUserId
      })
      .where(eq(schema.players.id, `40000000-0000-4000-8000-${suffix}`));
  }

  for (let i = 0; i < redPlayers.length; i++) {
    const p = redPlayers[i];
    if (!p) continue;
    const suffix = String(i + 6).padStart(12, '0');
    await db
      .update(schema.players)
      .set({
        gameName: p.name,
        riotTag: p.tag
      })
      .where(eq(schema.players.id, `40000000-0000-4000-8000-${suffix}`));
  }
}

function streamBufferOverWs(ws: WebSocket, filename: string, buffer: Buffer): void {
  ws.send(JSON.stringify({ type: 'start', filename }));
  const chunkSize = 64 * 1024;
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
    ws.send(chunk);
  }
  ws.send(JSON.stringify({ type: 'finish' }));
}

test('Test 1: Full legitimate upload and atomic persistence across 5 tables with score updates', async (t) => {
  const { client, db } = await setupTestDb();
  t.after(() => client.close());

  await registerAllPlayers(db);

  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const repository = new PostgresRoflUploadRepository(db);
  const wss = attachRoflUploadGateway(server, repository);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`);
  t.after(() => {
    try {
      ws.terminate();
    } catch {
      // Ignore
    }
  });

  const messages: WsServerEvent[] = [];
  const completionPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for ws events')), 20000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as WsServerEvent;
      messages.push(msg);
      if (msg.type === 'error' || msg.type === 'success') {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  await new Promise<void>((resolve) => ws.on('open', resolve));

  const roflBuffer = await readFile(fixtureRoflPath);
  streamBufferOverWs(ws, 'EUW1-7982902321.rofl', roflBuffer);

  await completionPromise;

  // 1. Verify WebSocket event sequence
  assert.ok(messages.some((m) => m.type === 'started'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'parsing'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'validating'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'persisting'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'completed'));

  const successMsg = messages.find((m) => m.type === 'success');
  assert.ok(successMsg && successMsg.type === 'success');
  assert.equal(successMsg.summary.processedGames, 1);
  assert.equal(successMsg.summary.detectedPlayersCount, 10);

  // 2. Verify match_games persistence
  const matchGameRows = await db
    .select()
    .from(schema.matchGames)
    .where(eq(schema.matchGames.externalGameId, 'EUW1-7982902321'));
  assert.equal(matchGameRows.length, 1);
  const insertedGame = matchGameRows[0];
  assert.ok(insertedGame);
  assert.equal(insertedGame.gameNumber, 1);
  assert.equal(insertedGame.winnerTeamId, '30000000-0000-4000-8000-000000000001');

  // 3. Verify player_game_info has 10 rows
  const infoRows = await db
    .select()
    .from(schema.playerGameInfo)
    .where(eq(schema.playerGameInfo.matchGameId, insertedGame.id));
  assert.equal(infoRows.length, 10);

  // 4. Verify player_game_stats, player_game_runes, player_game_build for each player
  for (const info of infoRows) {
    const statsRows = await db
      .select()
      .from(schema.playerGameStats)
      .where(eq(schema.playerGameStats.id, info.id));
    assert.equal(statsRows.length, 1);
    assert.ok(statsRows[0] && statsRows[0].damageToChampions > 0);

    const runesRows = await db
      .select()
      .from(schema.playerGameRunes)
      .where(eq(schema.playerGameRunes.id, info.id));
    assert.equal(runesRows.length, 1);
    assert.ok(runesRows[0] && runesRows[0].primaryKeystoneId > 0);

    const buildRows = await db
      .select()
      .from(schema.playerGameBuild)
      .where(eq(schema.playerGameBuild.id, info.id));
    assert.equal(buildRows.length, 1);
  }

  // 5. Verify match score update in matches table
  const matchRows = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, insertedGame.matchesId));
  assert.equal(matchRows.length, 1);
  const matchRecord = matchRows[0];
  assert.ok(matchRecord);
  assert.equal(matchRecord.status, 'live');
  assert.equal(matchRecord.team2Score, 1); // Blue team (Lobos) is team2 in match 70000000-...-0002
  assert.equal(matchRecord.team1Score, 0);
});

test('Test 2: Unregistered players abort immediately with descriptive list of missing summoners', async (t) => {
  const { client, db } = await setupTestDb();
  t.after(() => client.close());

  // Intentionally do NOT register the 10 players, so players in ROFL are unregistered

  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const repository = new PostgresRoflUploadRepository(db);
  const wss = attachRoflUploadGateway(server, repository);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`);
  t.after(() => {
    try {
      ws.terminate();
    } catch {
      // Ignore
    }
  });

  const messages: WsServerEvent[] = [];
  const completionPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for ws events')), 20000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as WsServerEvent;
      messages.push(msg);
      if (msg.type === 'error' || msg.type === 'success') {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  await new Promise<void>((resolve) => ws.on('open', resolve));

  const roflBuffer = await readFile(fixtureRoflPath);
  streamBufferOverWs(ws, 'EUW1-7982902321.rofl', roflBuffer);

  await completionPromise;

  const errorMsg = messages.find((m) => m.type === 'error');
  assert.ok(errorMsg && errorMsg.type === 'error');
  assert.match(errorMsg.message, /Validation failed/i);
  assert.match(errorMsg.message, /Iron Tou#EUW/i);
  assert.match(errorMsg.message, /Melintavahalma#8835/i);

  // Assert NO new rows were inserted in any of the tables
  const allMatchGames = await db.select().from(schema.matchGames);
  assert.equal(allMatchGames.length, 1); // Only demo game

  const allPlayerInfos = await db.select().from(schema.playerGameInfo);
  assert.equal(allPlayerInfos.length, 10); // Only demo player infos
});

test('Test 3: Multi-account anomaly detection and warning event emission without blocking persistence', async (t) => {
  const { client, db } = await setupTestDb();
  t.after(() => client.close());

  // Register all 10 players, but share discordUserId between player 1 and player 2
  await registerAllPlayers(db, { shareDiscordId: true });

  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const repository = new PostgresRoflUploadRepository(db);
  const wss = attachRoflUploadGateway(server, repository);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`);
  t.after(() => {
    try {
      ws.terminate();
    } catch {
      // Ignore
    }
  });

  const messages: WsServerEvent[] = [];
  const completionPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for ws events')), 20000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as WsServerEvent;
      messages.push(msg);
      if (msg.type === 'error' || msg.type === 'success') {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  await new Promise<void>((resolve) => ws.on('open', resolve));

  const roflBuffer = await readFile(fixtureRoflPath);
  streamBufferOverWs(ws, 'EUW1-7982902321.rofl', roflBuffer);

  await completionPromise;

  // 1. Verify anomaly event was emitted with detailed account and champion information
  const anomalyMsg = messages.find((m) => m.type === 'anomaly');
  assert.ok(anomalyMsg && anomalyMsg.type === 'anomaly');
  assert.equal(anomalyMsg.anomaly.discordUserId, '900000000000000001');
  assert.equal(anomalyMsg.anomaly.accounts.length, 2);
  const accountNames = anomalyMsg.anomaly.accounts.map((a) => a.account);
  assert.ok(accountNames.includes('Iron Tou#EUW'));
  assert.ok(accountNames.includes('Melintavahalma#8835'));

  // 2. Verify success event was received (anomaly does not block persistence)
  const successMsg = messages.find((m) => m.type === 'success');
  assert.ok(successMsg && successMsg.type === 'success');
  assert.equal(successMsg.summary.processedGames, 1);
  assert.equal(successMsg.summary.anomalies.length, 1);

  // 3. Verify data was persisted to database
  const matchGamesCount = await db.select().from(schema.matchGames);
  assert.equal(matchGamesCount.length, 2);
});

test('Test 4: Batch containing non-ROFL (exit code 11) emitting warning and successfully processing remaining valid replays', async (t) => {
  const { client, db } = await setupTestDb();
  t.after(() => client.close());

  await registerAllPlayers(db);

  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const repository = new PostgresRoflUploadRepository(db);
  const wss = attachRoflUploadGateway(server, repository);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  // Part A: Batch containing non-ROFL fake file AND valid ROFL replay
  {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`);
    t.after(() => {
      try {
        ws.terminate();
      } catch {
        // Ignore
      }
    });

    const messages: WsServerEvent[] = [];
    const completionPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for ws events')), 20000);
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as WsServerEvent;
        messages.push(msg);
        if (msg.type === 'error' || msg.type === 'success') {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    await new Promise<void>((resolve) => ws.on('open', resolve));

    const roflData = await readFile(fixtureRoflPath);
    const zipWithInvalid = createZipArchive([
      {
        name: 'corrupted_fake.rofl',
        content: 'NOT_A_VALID_RIOT_HEADER_BINARY_DATA'
      },
      {
        name: 'match1/EUW1-7982902321.rofl',
        content: roflData
      }
    ]);

    streamBufferOverWs(ws, 'batch_with_non_rofl.zip', zipWithInvalid);

    await completionPromise;

    // 1. Verify warning event was emitted for the invalid file
    const warningMsg = messages.find((m) => m.type === 'warning');
    assert.ok(warningMsg && warningMsg.type === 'warning');
    assert.match(
      warningMsg.message,
      /El archivo 'corrupted_fake\.rofl' no tiene la cabecera ROFL válida y ha sido omitido/
    );

    // 2. Verify success event was received for the valid replay
    const successMsg = messages.find((m) => m.type === 'success');
    assert.ok(successMsg && successMsg.type === 'success');
    assert.equal(successMsg.summary.processedGames, 1);

    // 3. Verify valid replay was saved to DB
    const matchGameRows = await db
      .select()
      .from(schema.matchGames)
      .where(eq(schema.matchGames.externalGameId, 'EUW1-7982902321'));
    assert.equal(matchGameRows.length, 1);
  }

  // Part B: Batch containing ONLY non-ROFL files aborts cleanly with descriptive error
  {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`);
    t.after(() => {
      try {
        ws.terminate();
      } catch {
        // Ignore
      }
    });

    const messages: WsServerEvent[] = [];
    const completionPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for ws events')), 20000);
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as WsServerEvent;
        messages.push(msg);
        if (msg.type === 'error' || msg.type === 'success') {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    await new Promise<void>((resolve) => ws.on('open', resolve));

    const zipWithOnlyInvalid = createZipArchive([
      {
        name: 'only_fake.rofl',
        content: 'NOT_A_VALID_HEADER'
      }
    ]);

    streamBufferOverWs(ws, 'only_invalid.zip', zipWithOnlyInvalid);

    await completionPromise;

    const warningMsg = messages.find((m) => m.type === 'warning');
    assert.ok(warningMsg && warningMsg.type === 'warning');
    assert.match(
      warningMsg.message,
      /El archivo 'only_fake\.rofl' no tiene la cabecera ROFL válida y ha sido omitido/
    );

    const errorMsg = messages.find((m) => m.type === 'error');
    assert.ok(errorMsg && errorMsg.type === 'error');
    assert.match(errorMsg.message, /No valid ROFL files found in batch/i);
  }
});
