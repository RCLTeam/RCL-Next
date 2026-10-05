import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { AuthUser, WsServerEvent } from '@rcl/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { WebSocket } from 'ws';
import { createApp } from '../../apps/api/src/app.js';
import type { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import type { CompetitionRepository } from '../../apps/api/src/modules/competition/competition.repository.js';
import { PostgresRoflUploadRepository } from '../../apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.js';
import type { RoflUploadRepository } from '../../apps/api/src/modules/rofl-upload/persistence/rofl-upload.repository.js';
import {
  createZipArchive,
  decompressionQueue
} from '../../apps/api/src/modules/rofl-upload/processing/process-batch-files.js';

import {
  type RoflUploadGatewayOptions,
  attachRoflUploadGateway
} from '../../apps/api/src/modules/rofl-upload/websocket/rofl-upload.gateway.js';
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

const stubRoflUploadRepo: RoflUploadRepository = {
  findPlayersByRiotIds: async () => [],
  checkExternalGamesExist: async () => [],
  findTeamMembershipsForDiscordUsers: async () => new Map(),
  findMatchForTeams: async () => null,
  executeBatchInsert: async () => ({ insertedGames: 0, skippedDuplicates: [] })
};

const FRONTEND_ORIGIN = 'http://localhost:5173';

// Existing protocol tests run without a session: the gateway only allows that through the
// explicit test option, never through the absence of an AuthService.
const unauthenticatedTestOptions: RoflUploadGatewayOptions = {
  frontendOrigin: FRONTEND_ORIGIN,
  allowUnauthenticated: true,
  logIncident: () => {}
};

function stubAuthService(role: AuthUser['role'] | null): {
  service: AuthService;
  calls: () => number;
} {
  let calls = 0;
  const service = {
    currentUser: async (token: string | undefined): Promise<AuthUser> => {
      calls++;
      if (!role || token !== 'valid-session-token') throw new Error('Sign-in is required.');
      return { discordId: '1', username: 'admin', globalName: null, avatarHash: null, role };
    }
  } as unknown as AuthService;
  return { service, calls: () => calls };
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return address.port;
}

/** Resolves with the HTTP status of a rejected handshake, or 101 if the socket opened. */
function handshakeStatus(ws: WebSocket): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    ws.on('open', () => resolve(101));
    ws.on('unexpected-response', (_req, res) => {
      resolve(res.statusCode ?? 0);
      res.resume();
    });
    ws.on('error', reject);
  });
}

function createTestServer(): http.Server {
  return http.createServer(
    createApp({ repository: mockCompetitionRepo, checkDatabase: async () => {}, corsOrigin: '*' })
  );
}

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

test('roflUploadGateway receives binary file chunks and notifies progress with mock repository', async (t) => {
  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const mockRepo: RoflUploadRepository = {
    ...stubRoflUploadRepo,
    findPlayersByRiotIds: async (riotIds) =>
      riotIds.map((r, i) => ({
        playerId: `mock-player-${i}`,
        gameName: r.gameName,
        riotTag: r.riotTag,
        discordUserId: `discord-${i}`,
        discordUsername: `DiscordUser${i}`
      })),
    findTeamMembershipsForDiscordUsers: async (ids) =>
      new Map(ids.map((id) => [id, '30000000-0000-4000-8000-000000000001'])),
    findMatchForTeams: async () => ({ matchId: 'mock-match-1', isClosed: false }),
    executeBatchInsert: async (games) => ({ insertedGames: games.length, skippedDuplicates: [] })
  };
  const wss = attachRoflUploadGateway(server, mockRepo, unauthenticatedTestOptions);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
  t.after(() => {
    try {
      ws.terminate();
    } catch {
      // Ignore
    }
  });

  const messages: WsServerEvent[] = [];
  const completionPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for ws events')), 5000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as WsServerEvent;
      messages.push(msg);
      if (msg.type === 'success' || msg.type === 'error') {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  await new Promise<void>((resolve) => ws.on('open', resolve));
  const roflBuffer = await readFile(fixtureRoflPath);
  ws.send(JSON.stringify({ type: 'start', filename: 'sample.rofl' }));
  const chunkSize = 64 * 1024;
  for (let offset = 0; offset < roflBuffer.length; offset += chunkSize) {
    const chunk = roflBuffer.subarray(offset, Math.min(offset + chunkSize, roflBuffer.length));
    ws.send(chunk);
  }
  ws.send(JSON.stringify({ type: 'finish' }));

  await completionPromise;

  assert.ok(messages.some((m) => m.type === 'started' && m.filename === 'sample.rofl'));
  assert.ok(messages.some((m) => m.type === 'stage'));
  assert.ok(messages.some((m) => m.type === 'progress'));
  const successMsg = messages.find((m) => m.type === 'success');
  assert.ok(successMsg && successMsg.type === 'success');
  assert.equal(successMsg.summary.processedGames, 1);
});

test('roflUploadGateway validates input errors and rejects invalid sequences', async (t) => {
  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const wss = attachRoflUploadGateway(server, stubRoflUploadRepo, unauthenticatedTestOptions);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  // 1. Binary chunk before start
  {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
    await new Promise<void>((resolve) => ws.on('open', resolve));
    const errorPromise = new Promise<WsServerEvent>((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    });
    ws.send(Buffer.from('UNEXPECTED_BINARY'));
    const err = await errorPromise;
    assert.equal(err.type, 'error');
    assert.match(err.message, /before upload was started/i);
    ws.terminate();
  }

  // 2. Unsupported file extension
  {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
    await new Promise<void>((resolve) => ws.on('open', resolve));
    const errorPromise = new Promise<WsServerEvent>((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    });
    ws.send(JSON.stringify({ type: 'start', filename: 'malicious.exe' }));
    const err = await errorPromise;
    assert.equal(err.type, 'error');
    assert.match(err.message, /Unsupported file type/i);
    ws.terminate();
  }

  // 3. Invalid JSON text payload
  {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
    await new Promise<void>((resolve) => ws.on('open', resolve));
    const errorPromise = new Promise<WsServerEvent>((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    });
    ws.send('NOT_VALID_JSON{[');
    const err = await errorPromise;
    assert.equal(err.type, 'error');
    assert.match(err.message, /Invalid JSON/i);
    ws.terminate();
  }

  // 4. Finish before start
  {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
    await new Promise<void>((resolve) => ws.on('open', resolve));
    const errorPromise = new Promise<WsServerEvent>((resolve) => {
      ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    });
    ws.send(JSON.stringify({ type: 'finish' }));
    const err = await errorPromise;
    assert.equal(err.type, 'error');
    assert.match(err.message, /No upload in progress/i);
    ws.terminate();
  }
});

test('roflUploadGateway handles abrupt socket disconnect cleanly', async (t) => {
  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const wss = attachRoflUploadGateway(server, stubRoflUploadRepo, unauthenticatedTestOptions);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
  await new Promise<void>((resolve) => ws.on('open', resolve));

  ws.send(JSON.stringify({ type: 'start', filename: 'abrupt.rofl' }));
  ws.send(Buffer.from('SOME_INITIAL_DATA'));

  // Abruptly terminate socket connection
  ws.terminate();

  // Wait a moment to ensure server cleans up without unhandled rejection or error
  await new Promise<void>((resolve) => setTimeout(resolve, 150));
  assert.ok(true);
});

test('roflUploadGateway streams real .rofl file and aborts on unregistered summoners', async (t) => {
  const { client, db } = await setupTestDb();
  t.after(() => client.close());

  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const repository = new PostgresRoflUploadRepository(db);
  const wss = attachRoflUploadGateway(server, repository, unauthenticatedTestOptions);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
  t.after(() => {
    try {
      ws.terminate();
    } catch {
      // Ignore
    }
  });

  const messages: WsServerEvent[] = [];
  const completionPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for ws events')), 15000);
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
  ws.send(JSON.stringify({ type: 'start', filename: 'EUW1-7982902321.rofl' }));

  // Stream in 64KB chunks
  const chunkSize = 64 * 1024;
  for (let offset = 0; offset < roflBuffer.length; offset += chunkSize) {
    const chunk = roflBuffer.subarray(offset, Math.min(offset + chunkSize, roflBuffer.length));
    ws.send(chunk);
  }
  ws.send(JSON.stringify({ type: 'finish' }));

  await completionPromise;

  assert.ok(messages.some((m) => m.type === 'started'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'decompressing'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'parsing'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'validating'));

  const errorMsg = messages.find((m) => m.type === 'error');
  assert.ok(errorMsg && errorMsg.type === 'error');
  assert.match(errorMsg.message, /Validation failed/i);
  assert.match(errorMsg.message, /Iron Tou#EUW/i);
});

test('roflUploadGateway streams .zip batch and completes atomic persistence', async (t) => {
  const { client, db } = await setupTestDb();
  t.after(() => client.close());

  // Register the 10 participants from EUW1-7982902321.rofl in the database
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

  // Update players 1..5 for blue team (Lobos) and players 6..10 for red team (Cuervos)
  for (let i = 0; i < bluePlayers.length; i++) {
    const p = bluePlayers[i];
    if (!p) continue;
    const suffix = String(i + 1).padStart(12, '0');
    const discordUserId = `90000000000000000${i + 1}`;
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

  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const repository = new PostgresRoflUploadRepository(db);
  const wss = attachRoflUploadGateway(server, repository, unauthenticatedTestOptions);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
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

  // Create a zip archive containing the real EUW1-7982902321.rofl replay
  const roflData = await readFile(fixtureRoflPath);
  const zipBuffer = createZipArchive([
    {
      name: 'match1/EUW1-7982902321.rofl',
      content: roflData
    }
  ]);

  ws.send(JSON.stringify({ type: 'start', filename: 'tournament_batch.zip' }));

  const chunkSize = 64 * 1024;
  for (let offset = 0; offset < zipBuffer.length; offset += chunkSize) {
    const chunk = zipBuffer.subarray(offset, Math.min(offset + chunkSize, zipBuffer.length));
    ws.send(chunk);
  }
  ws.send(JSON.stringify({ type: 'finish' }));

  await completionPromise;

  // Verify full event sequence
  assert.ok(messages.some((m) => m.type === 'started' && m.filename === 'tournament_batch.zip'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'decompressing'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'parsing'));
  assert.ok(messages.some((m) => m.type === 'progress'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'validating'));

  assert.equal(
    messages.some((m) => m.type === 'anomaly'),
    false
  );

  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'persisting'));
  assert.ok(messages.some((m) => m.type === 'stage' && m.stage === 'completed'));

  const successMsg = messages.find((m) => m.type === 'success');
  assert.ok(successMsg && successMsg.type === 'success');
  assert.equal(successMsg.summary.processedGames, 1);
  assert.equal(successMsg.summary.detectedPlayersCount, 10);
  assert.equal(successMsg.summary.anomalies.length, 0);

  // Verify atomic persistence in database
  const matchGamesRows = await db.select().from(schema.matchGames);
  assert.equal(matchGamesRows.length, 2); // 1 demo + 1 inserted

  const playerGameInfoRows = await db.select().from(schema.playerGameInfo);
  assert.equal(playerGameInfoRows.length, 20); // 10 demo + 10 inserted
});

test('roflUploadGateway emits queue event when zip waits in decompression queue', async (t) => {
  const app = createApp({
    repository: mockCompetitionRepo,
    checkDatabase: async () => {},
    corsOrigin: '*'
  });
  const server = http.createServer(app);
  const wss = attachRoflUploadGateway(server, stubRoflUploadRepo, unauthenticatedTestOptions);

  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    decompressionQueue.reset();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  // Lock decompression queue artificially
  const releaseLock = await decompressionQueue.acquire();

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
  t.after(() => {
    try {
      ws.terminate();
    } catch {
      // Ignore
    }
  });

  const queueEventPromise = new Promise<WsServerEvent>((resolve) => {
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as WsServerEvent;
      if (msg.type === 'queue') {
        resolve(msg);
      }
    });
  });

  await new Promise<void>((resolve) => ws.on('open', resolve));

  const zipBuffer = createZipArchive([{ name: 'test.rofl', content: 'RIOT_FAKE' }]);
  ws.send(JSON.stringify({ type: 'start', filename: 'queued.zip' }));
  ws.send(zipBuffer);
  ws.send(JSON.stringify({ type: 'finish' }));

  // Wait for queue event
  const queueMsg = await queueEventPromise;
  assert.equal(queueMsg.type, 'queue');
  assert.equal(queueMsg.stage, 'queue');
  assert.equal(queueMsg.position, 2);
  assert.equal(queueMsg.total, 2);

  // Now release lock so queued task can proceed
  releaseLock();
});

test('roflUploadGateway rejects handshakes with a foreign or missing Origin before authorizing', async (t) => {
  const server = createTestServer();
  const auth = stubAuthService('admin');
  const wss = attachRoflUploadGateway(server, stubRoflUploadRepo, {
    frontendOrigin: FRONTEND_ORIGIN,
    authService: auth.service,
    logIncident: () => {}
  });
  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const port = await listen(server);
  const url = `ws://127.0.0.1:${port}/ws/rofl-upload`;
  const headers = { cookie: 'rcl_session=valid-session-token' };

  const foreign = new WebSocket(url, { origin: 'https://attacker.example', headers });
  assert.equal(await handshakeStatus(foreign), 403);

  const missing = new WebSocket(url, { headers });
  assert.equal(await handshakeStatus(missing), 403);

  assert.equal(auth.calls(), 0);
});

test('roflUploadGateway accepts the frontend Origin with an admin session', async (t) => {
  const server = createTestServer();
  const auth = stubAuthService('admin');
  const wss = attachRoflUploadGateway(server, stubRoflUploadRepo, {
    frontendOrigin: FRONTEND_ORIGIN,
    authService: auth.service,
    logIncident: () => {}
  });
  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const port = await listen(server);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
    origin: FRONTEND_ORIGIN,
    headers: { cookie: 'rcl_session=valid-session-token' }
  });
  t.after(() => ws.terminate());
  const firstMessage = new Promise<WsServerEvent>((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString()) as WsServerEvent));
  });
  assert.equal(await handshakeStatus(ws), 101);
  ws.send(JSON.stringify({ type: 'start', filename: 'sample.rofl' }));
  const started = await firstMessage;
  assert.equal(started.type, 'started');
  assert.equal(auth.calls(), 1);
});

test('roflUploadGateway rejects every connection when no AuthService is configured', async (t) => {
  const server = createTestServer();
  const wss = attachRoflUploadGateway(server, stubRoflUploadRepo, {
    frontendOrigin: FRONTEND_ORIGIN,
    logIncident: () => {}
  });
  let connections = 0;
  wss.on('connection', () => connections++);
  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const port = await listen(server);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
  assert.equal(await handshakeStatus(ws), 503);
  assert.equal(connections, 0);
});

test('roflUploadGateway hides unexpected persistence errors behind an incidentId', async (t) => {
  const server = createTestServer();
  const internalMessage = 'duplicate key value violates unique constraint "match_games_pkey"';
  const logged: string[] = [];
  const failingRepo: RoflUploadRepository = {
    ...stubRoflUploadRepo,
    findPlayersByRiotIds: async (riotIds) =>
      riotIds.map((r, i) => ({
        playerId: `mock-player-${i}`,
        gameName: r.gameName,
        riotTag: r.riotTag,
        discordUserId: `discord-${i}`,
        discordUsername: `DiscordUser${i}`
      })),
    findTeamMembershipsForDiscordUsers: async (ids) =>
      new Map(ids.map((id) => [id, '30000000-0000-4000-8000-000000000001'])),
    executeBatchInsert: async () => {
      throw new Error(internalMessage);
    }
  };
  const wss = attachRoflUploadGateway(server, failingRepo, {
    ...unauthenticatedTestOptions,
    logIncident: (incidentId, context, error) => {
      logged.push(
        `${incidentId} ${context} ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
  t.after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const port = await listen(server);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, { origin: FRONTEND_ORIGIN });
  t.after(() => ws.terminate());
  const errorEvent = new Promise<WsServerEvent>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for ws events')), 10000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as WsServerEvent;
      if (msg.type === 'error' || msg.type === 'success') {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
  await new Promise<void>((resolve) => ws.on('open', resolve));
  ws.send(JSON.stringify({ type: 'start', filename: 'sample.rofl' }));
  ws.send(await readFile(fixtureRoflPath));
  ws.send(JSON.stringify({ type: 'finish' }));

  const event = await errorEvent;
  assert.ok(event.type === 'error');
  assert.doesNotMatch(event.message, /duplicate key|match_games_pkey/);
  assert.match(event.incidentId ?? '', /^[0-9a-f-]{36}$/);
  assert.ok(event.message.includes(event.incidentId ?? '<missing>'));
  assert.equal(logged.length, 1);
  assert.ok(logged[0]?.startsWith(event.incidentId ?? '<missing>'));
  assert.ok(logged[0]?.includes(internalMessage));
});
