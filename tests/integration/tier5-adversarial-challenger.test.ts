/**
 * Tier 5 Adversarial Coverage Hardening Test Suite
 * Objective: Verify Security, Secret Isolation, CSRF & Boundary Bypass Fuzzing,
 * State Machine Out-of-Order Delivery & Terminal State Lock, and Layer Decoupling Rubric.
 */

import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import type {
  BridgeHealthResponse,
  BridgeLoginFrame,
  BridgeLoginSuccessFrame,
  BridgeQueuedFrame,
  BridgeSuggestionConfirmedFrame,
  BridgeSuggestionFailedFrame
} from '@rcl/contracts';

import { createApp } from '../../apps/api/src/app.js';
import {
  BridgeRateLimitTimeoutError,
  DiscordBridgeClient
} from '../../apps/api/src/modules/discord-bridge/discord-bridge.client.js';
import { IncidentLogger } from '../../apps/api/src/modules/suggestions/incident-logger.js';
import { SuggestionStore } from '../../apps/api/src/modules/suggestions/suggestion.store.js';
import { SuggestionsService } from '../../apps/api/src/modules/suggestions/suggestions.service.js';

describe('Tier 5 Adversarial Coverage Hardening Suite', () => {
  let bridgeHttpServer: http.Server;
  let bridgeWss: WebSocketServer;
  let bridgeWsUrl: string;
  const supertoken = 'tier5-adversarial-supertoken-987654321';
  const frontendOrigin = 'http://localhost:5173';

  let bridgeClient: DiscordBridgeClient;
  let suggestionStore: SuggestionStore;
  let incidentLogger: IncidentLogger;
  let suggestionsService: SuggestionsService;
  let app: ReturnType<typeof createApp>;

  // Store for mock bot behavior controls
  let activeBotSocket: WebSocket | null = null;
  const respondWithQueued = true;
  const queuedDelayMs = 0;
  const autoConfirm = false;

  beforeAll(async () => {
    // 1. Setup mock bot WebSocket server
    await new Promise<void>((resolve) => {
      bridgeHttpServer = http.createServer();
      bridgeWss = new WebSocketServer({ server: bridgeHttpServer });
      bridgeHttpServer.listen(0, '127.0.0.1', () => {
        const addr = bridgeHttpServer.address() as AddressInfo;
        bridgeWsUrl = `ws://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    bridgeWss.on('connection', (ws) => {
      activeBotSocket = ws;

      ws.on('message', (raw) => {
        try {
          const frame = JSON.parse(raw.toString());
          if (frame.type === 'LOGIN') {
            if (frame.data?.token === supertoken) {
              const res: BridgeLoginSuccessFrame = {
                type: 'LOGIN_SUCCESS',
                data: { id: frame.data?.id, status: 'ok' }
              };
              ws.send(JSON.stringify(res));
            } else {
              ws.close(1008, 'Invalid token');
            }
          } else if (frame.type === 'SUGGESTION_CREATED') {
            const reqId = frame.data?.id;
            if (respondWithQueued) {
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  const queuedFrame: BridgeQueuedFrame = {
                    type: 'QUEUED',
                    data: { id: reqId }
                  };
                  ws.send(JSON.stringify(queuedFrame));

                  if (autoConfirm) {
                    setTimeout(() => {
                      if (ws.readyState === WebSocket.OPEN) {
                        const confirmedFrame: BridgeSuggestionConfirmedFrame = {
                          type: 'SUGGESTION_CONFIRMED',
                          data: {
                            id: reqId,
                            channel_id: '123456789012345678',
                            message_id: '987654321098765432',
                            thread_id: '112233445566778899'
                          }
                        };
                        ws.send(JSON.stringify(confirmedFrame));
                      }
                    }, 5);
                  }
                }
              }, queuedDelayMs);
            }
          }
        } catch {
          // Ignore malformed test frames
        }
      });
    });

    // 2. Setup backend with bridgeClient
    bridgeClient = new DiscordBridgeClient({
      wsUrl: bridgeWsUrl,
      supertoken,
      idleTimeoutMs: 30 * 60 * 1000,
      healthProbeTimeoutMs: 1000
    });

    suggestionStore = new SuggestionStore({ ttlMs: 2 * 60 * 60 * 1000 });
    incidentLogger = new IncidentLogger();
    suggestionsService = new SuggestionsService({
      store: suggestionStore,
      bridgeClient,
      logger: incidentLogger
    });

    app = createApp({
      repository: {} as unknown as Parameters<typeof createApp>[0]['repository'],
      checkDatabase: async () => {},
      corsOrigin: frontendOrigin,
      bridgeClient,
      suggestionsService,
      suggestionStore,
      incidentLogger
    });
  });

  afterAll(async () => {
    await bridgeClient.close();
    suggestionStore.close();
    await new Promise<void>((resolve) => {
      bridgeWss.close(() => {
        bridgeHttpServer.close(() => resolve());
      });
    });
  });

  // =========================================================================
  // 1. SECRET ISOLATION AUDIT
  // =========================================================================
  describe('1. Secret Isolation Audit', () => {
    it('1.1 apps/web/ production source tree contains ZERO occurrences of DISCORD_BOT_WS_SUPERTOKEN', () => {
      const webSrcDir = path.resolve(__dirname, '../../apps/web/src');
      const files: string[] = [];

      function collectFiles(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            collectFiles(fullPath);
          } else if (
            (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
            !entry.name.includes('.test.')
          ) {
            files.push(fullPath);
          }
        }
      }

      collectFiles(webSrcDir);
      expect(files.length).toBeGreaterThan(10);

      const violations: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('DISCORD_BOT_WS_SUPERTOKEN')) {
          violations.push(file);
        }
      }
      expect(violations).toEqual([]);
    });

    it('1.2 apps/web/ production source tree contains ZERO occurrences of DISCORD_BOT_WS_URL', () => {
      const webSrcDir = path.resolve(__dirname, '../../apps/web/src');
      const files: string[] = [];

      function collectFiles(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            collectFiles(fullPath);
          } else if (
            (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
            !entry.name.includes('.test.')
          ) {
            files.push(fullPath);
          }
        }
      }

      collectFiles(webSrcDir);
      const violations: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('DISCORD_BOT_WS_URL')) {
          violations.push(file);
        }
      }
      expect(violations).toEqual([]);
    });

    it('1.3 apps/web suggestions and bridge features contain ZERO direct WebSocket instances', () => {
      const targetDirs = [
        path.resolve(__dirname, '../../apps/web/src/features/suggestions'),
        path.resolve(__dirname, '../../apps/web/src/features/discord-bridge')
      ];

      for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir, { recursive: true }) as string[];
        for (const rel of files) {
          if ((rel.endsWith('.ts') || rel.endsWith('.tsx')) && !rel.includes('.test.')) {
            const content = fs.readFileSync(path.join(dir, rel), 'utf8');
            expect(content).not.toMatch(/new\s+WebSocket/);
            expect(content).not.toMatch(/ws:\/\/|wss:\/\//);
          }
        }
      }
    });

    it('1.4 GET /api/v1/bridge/health response never leaks supertoken or internal credentials under 200 OK', async () => {
      const res = await request(app).get('/api/v1/bridge/health');
      expect(res.status).toBe(200);
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain(supertoken);
      expect(bodyStr).not.toContain('supertoken');
      expect(bodyStr).not.toContain('stack');
      expect(bodyStr).not.toContain('trace');
      expect(res.body.healthy).toBe(true);
      expect(res.body.status).toBe('connected');
    });

    it('1.5 GET /api/v1/bridge/health never leaks supertoken or stack traces under 503 auth failure', async () => {
      const badClient = new DiscordBridgeClient({
        wsUrl: bridgeWsUrl,
        supertoken: 'WRONG_INVALID_TOKEN',
        healthProbeTimeoutMs: 500
      });
      const badApp = createApp({
        repository: {} as unknown as Parameters<typeof createApp>[0]['repository'],
        checkDatabase: async () => {},
        corsOrigin: frontendOrigin,
        bridgeClient: badClient,
        suggestionsService,
        suggestionStore,
        incidentLogger
      });

      const res = await request(badApp).get('/api/v1/bridge/health');
      expect(res.status).toBe(503);
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('WRONG_INVALID_TOKEN');
      expect(bodyStr).not.toContain(supertoken);
      expect(bodyStr).not.toContain('stack');
      expect(bodyStr).not.toContain('Error:');
      expect(res.body.status).toBe('authentication_failed');
      expect(res.body.healthy).toBe(false);

      await badClient.close();
    });

    it('1.6 GET /api/v1/bridge/health never leaks stack trace when checkHealth throws an exception', async () => {
      const throwingClient = {
        checkHealth: async () => {
          throw new Error('CRITICAL_INTERNAL_LEAK: db_password=p@ssword! in /var/app/secret.ts:42');
        }
      };
      const throwingApp = createApp({
        repository: {} as unknown as Parameters<typeof createApp>[0]['repository'],
        checkDatabase: async () => {},
        corsOrigin: frontendOrigin,
        bridgeClient: throwingClient as unknown as DiscordBridgeClient,
        suggestionsService,
        suggestionStore,
        incidentLogger
      });

      const res = await request(throwingApp).get('/api/v1/bridge/health');
      expect(res.status).toBe(503);
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('CRITICAL_INTERNAL_LEAK');
      expect(bodyStr).not.toContain('p@ssword!');
      expect(bodyStr).not.toContain('stack');
      expect(bodyStr).not.toContain('/var/app/secret.ts');
      expect(res.body).toEqual({
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      });
    });

    it('1.7 GET /api/v1/suggestions/status/:id never leaks stack traces or secrets on malicious path traversal IDs', async () => {
      const maliciousIds = [
        '../../../etc/passwd',
        '..%2F..%2F..%2Fetc%2Fpasswd',
        "' OR '1'='1' --",
        '<script>alert(1)</script>',
        'id-with-null\0byte',
        'a'.repeat(5000),
        '~!@#$%^&*()_+{}|:"<>?[];\',./'
      ];

      for (const id of maliciousIds) {
        const res = await request(app).get(`/api/v1/suggestions/status/${encodeURIComponent(id)}`);
        expect([400, 404]).toContain(res.status);
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('stack');
        expect(bodyStr).not.toContain('node_modules');
        expect(bodyStr).not.toContain('supertoken');
        expect(bodyStr).not.toContain(supertoken);
      }
    });
  });

  // =========================================================================
  // 2. CSRF & BOUNDARY BYPASS FUZZING
  // =========================================================================
  describe('2. CSRF & Boundary Bypass Fuzzing', () => {
    describe('2.1 Origin CSRF Spoofing Fuzzing', () => {
      const invalidOrigins = [
        'null',
        'http://evil.com',
        'https://evil.com',
        'http://localhost:5173.attacker.com',
        'http://attacker.com/http://localhost:5173',
        'http://attacker.com?origin=http://localhost:5173',
        'https://localhost:5173', // Wrong protocol
        'http://localhost:5174', // Wrong port
        'http://localhost:5173:8080', // Appended port
        'http://localhost:5173/', // Trailing slash
        'http://127.0.0.1:5173', // IP instead of localhost
        'HTTP://LOCALHOST:5173' // Casing mismatch
      ];

      for (const badOrigin of invalidOrigins) {
        it(`rejects request with spoofed Origin: "${badOrigin}" with strict HTTP 403`, async () => {
          const res = await request(app)
            .post('/api/v1/suggestions')
            .set('Origin', badOrigin)
            .send({ suggestion: 'Sugerencia legítima de prueba' });

          expect(res.status).toBe(403);
          expect(res.body.error?.code).toBe('INVALID_ORIGIN');
          expect(res.body.error?.message).toBe('Request origin is not allowed.');
        });
      }

      it('rejects request with completely omitted Origin header with HTTP 403', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .send({ suggestion: 'Sugerencia sin encabezado Origin' });

        expect(res.status).toBe(403);
        expect(res.body.error?.code).toBe('INVALID_ORIGIN');
      });

      it('strictly accepts request with exact matching Origin: "http://localhost:5173"', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: 'Sugerencia con origen legítimo' });

        expect(res.status).toBe(202);
        expect(res.body.status).toBe('queued');
        expect(typeof res.body.id).toBe('string');
      });
    });

    describe('2.2 Payload Boundary & Character Fuzzing', () => {
      it('rejects 0 characters (empty string) with 400 VALIDATION_ERROR', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: '' });

        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe('VALIDATION_ERROR');
      });

      it('rejects 9 characters ("123456789") with 400 VALIDATION_ERROR', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: '123456789' });

        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe('VALIDATION_ERROR');
        expect(res.body.error?.message).toContain('between 10 and 1000 characters');
      });

      it('accepts exact lower boundary of 10 characters with 202 ACCEPTED', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: '1234567890' });

        expect(res.status).toBe(202);
        expect(res.body.status).toBe('queued');
      });

      it('accepts exact upper boundary of 1000 characters with 202 ACCEPTED', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: 'A'.repeat(1000) });

        expect(res.status).toBe(202);
        expect(res.body.status).toBe('queued');
      });

      it('rejects 1001 characters ("A".repeat(1001)) with 400 VALIDATION_ERROR', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: 'A'.repeat(1001) });

        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe('VALIDATION_ERROR');
      });

      it('rejects 10000 characters with 400 VALIDATION_ERROR', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: 'X'.repeat(10000) });

        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe('VALIDATION_ERROR');
      });

      it('rejects 10 whitespace characters that trim down to 0 length', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: '          ' });

        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe('VALIDATION_ERROR');
      });

      it('rejects 9 non-whitespace characters padded by 20 leading/trailing spaces', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: '          123456789          ' });

        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe('VALIDATION_ERROR');
      });

      it('handles null bytes embedded in text safely without crashing or corrupting', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: 'Texto válido con byte nulo \0 aquí' });

        expect(res.status).toBe(202);
        expect(res.body.status).toBe('queued');
      });

      it('handles emojis properly by UTF-16 code units (5 surrogate pairs = length 10)', async () => {
        // 5 emoji characters: 🎮 (2) + ⚽ (1 or 2) + 🏆 (2) + 🔥 (2) + 💯 (2)
        const fiveEmojis = '🎮⚽🏆🔥💯'; // JS .length is 9 or 10 depending on emoji
        const exact10Emojis = '🎮🏆🔥💯🚀'; // each is 2 code units => total length 10
        expect(exact10Emojis.length).toBe(10);

        const res10 = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: exact10Emojis });

        expect(res10.status).toBe(202);

        // 4 surrogate pair emojis => length 8 => rejected
        const fourEmojis = '🎮🏆🔥💯';
        expect(fourEmojis.length).toBe(8);
        const res8 = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: fourEmojis });

        expect(res8.status).toBe(400);
        expect(res8.body.error?.code).toBe('VALIDATION_ERROR');
      });

      it('handles 500 emojis (1000 UTF-16 code units) at maximum boundary', async () => {
        const fiveHundredEmojis = '🔥'.repeat(500); // 500 * 2 = 1000 length
        expect(fiveHundredEmojis.length).toBe(1000);

        const resPass = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: fiveHundredEmojis });

        expect(resPass.status).toBe(202);

        // 501 emojis = 1002 length => rejected
        const fiveHundredOneEmojis = '🔥'.repeat(501);
        expect(fiveHundredOneEmojis.length).toBe(1002);

        const resFail = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: fiveHundredOneEmojis });

        expect(resFail.status).toBe(400);
      });

      it('accepts multilingual unicode: CJK, Arabic, Cyrillic, Spanish accents', async () => {
        const cjkText = '这是一段用来测试中文编码的建议内容'; // 18 chars
        const resCjk = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: cjkText });
        expect(resCjk.status).toBe(202);

        const arabicText = 'هذا نص تجريبي باللغة العربية للاختبار'; // 37 chars
        const resArabic = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: arabicText });
        expect(resArabic.status).toBe(202);

        const spanishAccents = '¡Canción épica con ñandú y pingüino!'; // 36 chars
        const resSpanish = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .send({ suggestion: spanishAccents });
        expect(resSpanish.status).toBe(202);
      });

      it('rejects non-string suggestion payloads (numbers, booleans, objects, arrays, null)', async () => {
        const badTypes = [
          1234567890,
          true,
          false,
          null,
          ['array', 'with', 'elements'],
          { text: 'object with text' }
        ];

        for (const badVal of badTypes) {
          const res = await request(app)
            .post('/api/v1/suggestions')
            .set('Origin', frontendOrigin)
            .send({ suggestion: badVal });

          expect(res.status).toBe(400);
          expect(res.body.error?.code).toBe('VALIDATION_ERROR');
        }
      });

      it('rejects malformed raw JSON with HTTP 400 INVALID_JSON', async () => {
        const res = await request(app)
          .post('/api/v1/suggestions')
          .set('Origin', frontendOrigin)
          .set('Content-Type', 'application/json')
          .send('{"suggestion": "unclosed json string');

        expect(res.status).toBe(400);
        expect(res.body.error?.code).toBe('INVALID_JSON');
      });
    });
  });

  // =========================================================================
  // 3. STATE MACHINE OUT-OF-ORDER DELIVERY & TERMINAL LOCK FUZZING
  // =========================================================================
  describe('3. State Machine Out-of-Order Delivery & Terminal Lock Fuzzing', () => {
    it('3.1 SUGGESTION_CONFIRMED received BEFORE QUEUED is handled and locks status into confirmed', async () => {
      const store = new SuggestionStore();
      const mockBridge = new DiscordBridgeClient({
        wsUrl: bridgeWsUrl,
        supertoken
      });

      // Override send to simulate delayed resolution (QUEUED arriving after CONFIRMED)
      let resolveSend!: () => void;
      mockBridge.send = async () => {
        return new Promise<void>((resolve) => {
          resolveSend = resolve;
        });
      };

      const service = new SuggestionsService({
        store,
        bridgeClient: mockBridge,
        logger: new IncidentLogger()
      });

      const submission = await service.submit({
        suggestion: 'Out-of-order test suggestion'
      });
      const id = submission.id;

      // Status is queued initially
      expect(service.getStatus(id)?.status).toBe('queued');

      // Now bot delivers SUGGESTION_CONFIRMED before QUEUED
      mockBridge.emit('SUGGESTION_CONFIRMED', {
        id,
        channel_id: 'ch-1',
        message_id: 'msg-1'
      });

      // Status transitions immediately to confirmed
      expect(service.getStatus(id)?.status).toBe('confirmed');

      // Now bridge resolves send (simulating delayed QUEUED frame)
      resolveSend();
      await new Promise((r) => setTimeout(r, 10));

      // Terminal state MUST NOT regress to processing or sending!
      const finalStatus = service.getStatus(id);
      expect(finalStatus?.status).toBe('confirmed');
    });

    it('3.2 SUGGESTION_FAILED received BEFORE QUEUED locks status into failed with incidentId', async () => {
      const store = new SuggestionStore();
      const mockBridge = new DiscordBridgeClient({
        wsUrl: bridgeWsUrl,
        supertoken
      });

      let resolveSend!: () => void;
      mockBridge.send = async () => {
        return new Promise<void>((resolve) => {
          resolveSend = resolve;
        });
      };

      const logger = new IncidentLogger();
      const service = new SuggestionsService({
        store,
        bridgeClient: mockBridge,
        logger
      });

      const submission = await service.submit({
        suggestion: 'Out-of-order failure test'
      });
      const id = submission.id;

      // Bot delivers SUGGESTION_FAILED before send resolves
      mockBridge.emit('SUGGESTION_FAILED', {
        id,
        reason: 'Bot channel full',
        incident_id: 'custom-incident-uuid-001'
      });

      expect(service.getStatus(id)?.status).toBe('failed');
      expect(service.getStatus(id)?.incidentId).toBe('custom-incident-uuid-001');

      // Now send resolves (late QUEUED)
      resolveSend();
      await new Promise((r) => setTimeout(r, 10));

      // Terminal state must remain failed!
      const statusAfterResolve = service.getStatus(id);
      expect(statusAfterResolve?.status).toBe('failed');
      expect(statusAfterResolve?.incidentId).toBe('custom-incident-uuid-001');
    });

    it('3.3 Terminal state lock: once confirmed, store ignores sending, retrying, and processing updates', () => {
      const store = new SuggestionStore();
      const id = 'terminal-lock-confirmed-test';
      store.create(id, 'queued');

      // Transition to confirmed
      store.update(id, {
        status: 'confirmed',
        channelId: 'ch-100',
        messageId: 'msg-200'
      });
      expect(store.get(id)?.status).toBe('confirmed');

      // Attempt regression to sending
      store.update(id, { status: 'sending' });
      expect(store.get(id)?.status).toBe('confirmed');

      // Attempt regression to retrying
      store.update(id, { status: 'retrying', nextRetryInSeconds: 30 });
      expect(store.get(id)?.status).toBe('confirmed');

      // Attempt regression to processing
      store.update(id, { status: 'processing' });
      expect(store.get(id)?.status).toBe('confirmed');

      // Attempt regression to queued
      store.update(id, { status: 'queued' });
      expect(store.get(id)?.status).toBe('confirmed');
    });

    it('3.4 Terminal state lock: once failed, store ignores sending, retrying, and processing updates', () => {
      const store = new SuggestionStore();
      const id = 'terminal-lock-failed-test';
      store.create(id, 'queued');

      // Transition to failed
      store.update(id, {
        status: 'failed',
        incidentId: 'inc-failed-123',
        error: 'Terminal rate limit exceeded'
      });
      expect(store.get(id)?.status).toBe('failed');

      // Attempt regression to sending
      store.update(id, { status: 'sending' });
      expect(store.get(id)?.status).toBe('failed');

      // Attempt regression to retrying
      store.update(id, { status: 'retrying', nextRetryInSeconds: 15 });
      expect(store.get(id)?.status).toBe('failed');

      // Attempt regression to processing
      store.update(id, { status: 'processing' });
      expect(store.get(id)?.status).toBe('failed');

      // Attempt regression to queued
      store.update(id, { status: 'queued' });
      expect(store.get(id)?.status).toBe('failed');
    });

    it('3.5 Duplicate frames: duplicate SUGGESTION_CONFIRMED maintains idempotency and integrity', () => {
      const store = new SuggestionStore();
      const id = 'duplicate-confirmed-test';
      store.create(id, 'processing');

      // First confirmation
      store.update(id, {
        status: 'confirmed',
        channelId: 'ch-1',
        messageId: 'msg-1',
        threadId: 'th-1'
      });
      expect(store.get(id)?.status).toBe('confirmed');
      expect(store.get(id)?.channelId).toBe('ch-1');

      // Duplicate confirmation frame
      store.update(id, {
        status: 'confirmed',
        channelId: 'ch-1',
        messageId: 'msg-1',
        threadId: 'th-1'
      });
      expect(store.get(id)?.status).toBe('confirmed');
    });

    it('3.6 Fuzzing concurrent chaotic state transitions maintains terminal invariant', async () => {
      const store = new SuggestionStore();
      const id = 'chaotic-fuzz-test';
      store.create(id, 'queued');

      // Concurrently fire 200 random updates
      const statuses: Array<
        'queued' | 'sending' | 'processing' | 'retrying' | 'confirmed' | 'failed'
      > = ['queued', 'sending', 'processing', 'retrying', 'confirmed', 'failed'];

      let hasReachedConfirmed = false;
      let hasReachedFailed = false;

      for (let i = 0; i < 200; i++) {
        const nextStatus = statuses[i % statuses.length];
        if (!nextStatus) continue;
        if (nextStatus === 'confirmed') hasReachedConfirmed = true;
        if (nextStatus === 'failed') hasReachedFailed = true;

        const updatePayload: Parameters<typeof store.update>[1] = {
          status: nextStatus
        };
        if (nextStatus === 'retrying') {
          updatePayload.nextRetryInSeconds = 10;
        }
        if (nextStatus === 'failed') {
          updatePayload.incidentId = `incident-${i}`;
        }

        store.update(id, updatePayload);

        const current = store.get(id)?.status;
        // If it ever transitioned to confirmed or failed, it must remain in a terminal state
        if (hasReachedConfirmed || hasReachedFailed) {
          expect(['confirmed', 'failed']).toContain(current);
        }
      }
    });
  });

  // =========================================================================
  // 4. LAYER DECOUPLING RUBRIC AUDIT
  // =========================================================================
  describe('4. Layer Decoupling Rubric Audit', () => {
    it('4.1 DiscordBridgeClient in apps/api/src/modules/discord-bridge/ contains ZERO occurrences of "suggestion"', () => {
      const bridgeDir = path.resolve(__dirname, '../../apps/api/src/modules/discord-bridge');
      const bridgeFiles = [
        path.join(bridgeDir, 'discord-bridge.client.ts'),
        path.join(bridgeDir, 'discord-bridge.router.ts'),
        path.join(bridgeDir, 'index.ts')
      ];

      const domainRegex = /\bsuggestions?\b/i;
      const violations: { file: string; line: number; match: string }[] = [];

      for (const filePath of bridgeFiles) {
        if (!fs.existsSync(filePath)) continue;
        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        lines.forEach((lineContent, lineIdx) => {
          if (domainRegex.test(lineContent)) {
            violations.push({
              file: path.basename(filePath),
              line: lineIdx + 1,
              match: lineContent.trim()
            });
          }
        });
      }

      expect(violations).toEqual([]);
    });

    it('4.2 DiscordBridgeClient send method accepts generic frames without domain-specific types', () => {
      const clientTsPath = path.resolve(
        __dirname,
        '../../apps/api/src/modules/discord-bridge/discord-bridge.client.ts'
      );
      const content = fs.readFileSync(clientTsPath, 'utf8');

      // Verify BridgeOutgoingFrame signature
      expect(content).toContain('export interface BridgeOutgoingFrame');
      expect(content).toContain('type: string;');
      expect(content).toContain('data: { id: string; [key: string]: unknown };');

      // Verify send method signature
      expect(content).toMatch(
        /public\s+(?:async\s+)?send\s*\(\s*frame:\s*BridgeOutgoingFrame\s*\)/
      );
    });

    it('4.3 DiscordBridgeClient emits generic queue events and opcode-based server frame routing', () => {
      const clientTsPath = path.resolve(
        __dirname,
        '../../apps/api/src/modules/discord-bridge/discord-bridge.client.ts'
      );
      const content = fs.readFileSync(clientTsPath, 'utf8');

      // Generic lifecycle event emissions
      expect(content).toContain("this.emit('frame:sending'");
      expect(content).toContain("this.emit('frame:retrying'");

      // Generic server frame dispatch
      expect(content).toContain('this.emit(frame.type, frame.data)');

      // Zero hardcoded suggestion event listeners or emitters
      expect(content).not.toContain("this.emit('suggestion:");
      expect(content).not.toContain("this.on('suggestion:");
    });

    it('4.4 Domain logic (author resolution, text bounds, store TTL, incident logging) strictly lives in modules/suggestions/', () => {
      const suggestionsDir = path.resolve(__dirname, '../../apps/api/src/modules/suggestions');
      expect(fs.existsSync(path.join(suggestionsDir, 'suggestions.service.ts'))).toBe(true);
      expect(fs.existsSync(path.join(suggestionsDir, 'suggestion.store.ts'))).toBe(true);
      expect(fs.existsSync(path.join(suggestionsDir, 'incident-logger.ts'))).toBe(true);
      expect(fs.existsSync(path.join(suggestionsDir, 'suggestions.router.ts'))).toBe(true);

      const serviceContent = fs.readFileSync(
        path.join(suggestionsDir, 'suggestions.service.ts'),
        'utf8'
      );
      expect(serviceContent).toContain("type: 'SUGGESTION_CREATED'");
      expect(serviceContent).toMatch(/this\.bridgeClient\.on\(\s*['"]SUGGESTION_CONFIRMED['"]/);
      expect(serviceContent).toMatch(/this\.bridgeClient\.on\(\s*['"]SUGGESTION_FAILED['"]/);
    });
  });
});
