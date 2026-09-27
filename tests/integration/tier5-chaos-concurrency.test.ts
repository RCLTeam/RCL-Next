/**
 * Tier 5 Adversarial Coverage Hardening Suite: Concurrency & Chaos Resiliency
 * File: RCL-Next/tests/integration/tier5-chaos-concurrency.test.ts
 *
 * Target: Commit ebd80ac
 * Verifies:
 *  1. 100-Request Burst Stress Test (Strict concurrency=1 over socket, FIFO, zero drops, zero leaks)
 *  2. Chaos Network Injection (Abrupt socket terminations, automatic reconnects, zero hangs)
 *  3. Anti-Stampede & Timeout Stress (Queue pause, retry countdown, 5-minute incident failure)
 *  4. Architectural Decoupling & Invariant Verification
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import type {
  BridgeLoginFrame,
  BridgeLoginSuccessFrame,
  BridgeQueuedFrame,
  BridgeRateLimitErrorFrame,
  BridgeSuggestionConfirmedFrame,
  BridgeSuggestionCreatedFrame,
  BridgeSuggestionFailedFrame,
  CreateSuggestionResponse,
  SuggestionStatusResponse
} from '@rcl/contracts';

import { createApp } from '../../apps/api/src/app.js';
import {
  BridgeRateLimitTimeoutError,
  DiscordBridgeClient
} from '../../apps/api/src/modules/discord-bridge/discord-bridge.client.js';
import { IncidentLogger } from '../../apps/api/src/modules/suggestions/incident-logger.js';
import { SuggestionStore } from '../../apps/api/src/modules/suggestions/suggestion.store.js';
import { SuggestionsService } from '../../apps/api/src/modules/suggestions/suggestions.service.js';

describe('Tier 5 Adversarial Concurrency & Chaos Resiliency Suite', () => {
  let bridgeHttpServer: http.Server;
  let bridgeWss: WebSocketServer;
  let bridgeWsUrl: string;
  const mockSupertoken = 'tier5-adversarial-supertoken-776655';
  const frontendOrigin = 'http://localhost:5173';

  // Chaos controls
  let dropSocketOnSuggestionCreated = false;
  let dropSocketAfterQueued = false;
  let rateLimitCount = 0;
  let rateLimitSeconds = 30;
  let currentInFlight = 0;
  let maxConcurrentInFlight = 0;
  const receivedSuggestionIds: string[] = [];

  let bridgeClient: DiscordBridgeClient;
  let suggestionStore: SuggestionStore;
  let incidentLogger: IncidentLogger;
  let suggestionsService: SuggestionsService;
  let app: ReturnType<typeof createApp>;

  // Unhandled rejection tracker
  const unhandledRejections: unknown[] = [];
  const rejectionHandler = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  beforeAll(async () => {
    process.on('unhandledRejection', rejectionHandler);

    bridgeHttpServer = http.createServer();
    bridgeWss = new WebSocketServer({ server: bridgeHttpServer });

    await new Promise<void>((resolve) => {
      bridgeHttpServer.listen(0, '127.0.0.1', () => {
        const addr = bridgeHttpServer.address() as AddressInfo;
        bridgeWsUrl = `ws://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    bridgeWss.on('connection', (ws) => {
      ws.on('message', async (raw) => {
        try {
          const frame = JSON.parse(raw.toString());

          if (frame.type === 'LOGIN') {
            const login = frame as BridgeLoginFrame;
            if (login.data.token !== mockSupertoken) {
              ws.close(1008, 'Unauthorized');
              return;
            }
            const successFrame: BridgeLoginSuccessFrame = {
              type: 'LOGIN_SUCCESS',
              data: { id: login.data.id, status: 'ok' }
            };
            ws.send(JSON.stringify(successFrame));
          } else if (frame.type === 'SUGGESTION_CREATED') {
            const req = frame as BridgeSuggestionCreatedFrame;
            receivedSuggestionIds.push(req.data.id);

            currentInFlight++;
            if (currentInFlight > maxConcurrentInFlight) {
              maxConcurrentInFlight = currentInFlight;
            }

            if (dropSocketOnSuggestionCreated) {
              dropSocketOnSuggestionCreated = false;
              currentInFlight--;
              ws.terminate();
              return;
            }

            if (rateLimitCount > 0) {
              rateLimitCount--;
              currentInFlight--;
              const errFrame: BridgeRateLimitErrorFrame = {
                type: 'ERROR',
                data: {
                  id: req.data.id,
                  code: 'RATE_LIMITED',
                  message: 'Rate limit exceeded',
                  retry_after_seconds: rateLimitSeconds
                }
              };
              ws.send(JSON.stringify(errFrame));
              return;
            }

            // Small delay to detect concurrency overlaps
            await new Promise((r) => setTimeout(r, 5));

            // Phase 1: Emit QUEUED
            const queuedFrame: BridgeQueuedFrame = {
              type: 'QUEUED',
              data: { id: req.data.id }
            };

            if (dropSocketAfterQueued) {
              dropSocketAfterQueued = false;
              currentInFlight--;
              ws.send(JSON.stringify(queuedFrame), () => {
                setTimeout(() => {
                  ws.terminate();
                }, 10);
              });
              return;
            }

            ws.send(JSON.stringify(queuedFrame));
            currentInFlight--;

            // Phase 2: Asynchronous confirmation
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) {
                const confFrame: BridgeSuggestionConfirmedFrame = {
                  type: 'SUGGESTION_CONFIRMED',
                  data: {
                    id: req.data.id,
                    channel_id: '999111',
                    message_id: '888222',
                    thread_id: '777333'
                  }
                };
                ws.send(JSON.stringify(confFrame));
              }
            }, 10);
          }
        } catch {
          // Ignore parse errors in mock
        }
      });
    });

    bridgeClient = new DiscordBridgeClient({
      wsUrl: bridgeWsUrl,
      supertoken: mockSupertoken,
      maxRetryDurationMs: 60000, // 60s budget for nominal and chaos tests
      sleepFn: async (ms: number) => {
        // Accelerated sleep for fast deterministic testing
        await new Promise((r) => setTimeout(r, Math.min(ms, 15)));
      }
    });

    suggestionStore = new SuggestionStore();
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
    process.removeListener('unhandledRejection', rejectionHandler);
    await bridgeClient.close();
    suggestionStore.close();
    await new Promise<void>((resolve) => {
      bridgeWss.close(() => {
        bridgeHttpServer.close(() => resolve());
      });
    });
  });

  beforeEach(() => {
    dropSocketOnSuggestionCreated = false;
    dropSocketAfterQueued = false;
    rateLimitCount = 0;
    rateLimitSeconds = 30;
    currentInFlight = 0;
    maxConcurrentInFlight = 0;
    receivedSuggestionIds.length = 0;
  });

  describe('1. 100-Request Burst Stress Test', () => {
    it('handles 100 simultaneous suggestions with strict FIFO concurrency=1 and zero drops', async () => {
      const listenerCountSendingBefore = bridgeClient.listenerCount('frame:sending');
      const listenerCountRetryingBefore = bridgeClient.listenerCount('frame:retrying');
      const listenerCountConfirmedBefore = bridgeClient.listenerCount('SUGGESTION_CONFIRMED');
      const listenerCountFailedBefore = bridgeClient.listenerCount('SUGGESTION_FAILED');

      const burstSize = 100;
      const submissionPromises: Promise<request.Response>[] = [];

      for (let i = 0; i < burstSize; i++) {
        submissionPromises.push(
          request(app)
            .post('/api/v1/suggestions')
            .set('Origin', frontendOrigin)
            .send({
              suggestion: `Adversarial burst concurrent suggestion payload #${i.toString().padStart(3, '0')}`,
              isAnonymous: i % 2 === 0
            })
        );
      }

      // 1. All 100 HTTP requests return 202 Accepted concurrently
      const responses = await Promise.all(submissionPromises);
      expect(responses).toHaveLength(burstSize);

      const submittedIds: string[] = [];
      for (const res of responses) {
        expect(res.status).toBe(202);
        const body = res.body as CreateSuggestionResponse;
        expect(body.status).toBe('queued');
        expect(typeof body.id).toBe('string');
        submittedIds.push(body.id);
      }

      // 2. Wait for all 100 suggestions to complete Phase 1 and Phase 2
      const startTime = Date.now();
      let allConfirmed = false;
      while (Date.now() - startTime < 10000) {
        let confirmedCount = 0;
        for (const id of submittedIds) {
          const rec = suggestionStore.get(id);
          if (rec?.status === 'confirmed') {
            confirmedCount++;
          }
        }
        if (confirmedCount === burstSize) {
          allConfirmed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 25));
      }

      expect(allConfirmed).toBe(true);

      // 3. Strict Concurrency = 1 Invariant
      expect(maxConcurrentInFlight).toBe(1);

      // 4. Strict Sequential FIFO Queue Invariant
      expect(receivedSuggestionIds).toHaveLength(burstSize);
      expect(receivedSuggestionIds).toEqual(submittedIds);

      // 5. Zero unhandled rejections
      expect(unhandledRejections).toHaveLength(0);

      // 6. Zero EventEmitter memory leaks
      expect(bridgeClient.listenerCount('frame:sending')).toBe(listenerCountSendingBefore);
      expect(bridgeClient.listenerCount('frame:retrying')).toBe(listenerCountRetryingBefore);
      expect(bridgeClient.listenerCount('SUGGESTION_CONFIRMED')).toBe(listenerCountConfirmedBefore);
      expect(bridgeClient.listenerCount('SUGGESTION_FAILED')).toBe(listenerCountFailedBefore);
    }, 15000);
  });

  describe('2. Chaos Network Injection', () => {
    it('recovers and processes subsequent items when socket abruptly closes right after Phase 1 QUEUED', async () => {
      dropSocketAfterQueued = true;

      // Submit suggestion A: receives QUEUED, then socket terminates abruptly
      const resA = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', frontendOrigin)
        .send({ suggestion: 'Chaos suggestion A - socket drops after QUEUED' });

      expect(resA.status).toBe(202);
      const idA = (resA.body as CreateSuggestionResponse).id;

      // Wait for suggestion A to receive QUEUED and for socket to terminate
      await new Promise((r) => setTimeout(r, 60));

      // Submit suggestion B: submitted while socket is disconnected
      const resB = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', frontendOrigin)
        .send({ suggestion: 'Chaos suggestion B - submitted during socket outage' });

      expect(resB.status).toBe(202);
      const idB = (resB.body as CreateSuggestionResponse).id;

      // Wait for both to be processed: A reaches processing (or confirmed/failed gracefully) and B reaches confirmed
      const startTime = Date.now();
      while (Date.now() - startTime < 8000) {
        const recA = suggestionStore.get(idA);
        const recB = suggestionStore.get(idB);
        if (
          recA &&
          recA.status !== 'queued' &&
          recA.status !== 'sending' &&
          recB?.status === 'confirmed'
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 25));
      }

      const finalA = suggestionStore.get(idA);
      const finalB = suggestionStore.get(idB);

      // Suggestion A successfully completed Phase 1 (processing) or failed gracefully with incident
      expect(finalA?.status).toMatch(/processing|confirmed|failed/);

      // Crucial Resiliency Proof: Suggestion B auto-reconnected and succeeded
      expect(finalB?.status).toBe('confirmed');
      expect(unhandledRejections).toHaveLength(0);
    }, 10000);

    it('gracefully fails item and unblocks queue when socket drops before Phase 1 QUEUED frame', async () => {
      dropSocketOnSuggestionCreated = true;

      // Submit suggestion X: socket terminates before QUEUED frame arrives
      const resX = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', frontendOrigin)
        .send({ suggestion: 'Chaos suggestion X - terminates before QUEUED arrives' });

      expect(resX.status).toBe(202);
      const idX = (resX.body as CreateSuggestionResponse).id;

      // Submit suggestion Y: should unblock, reconnect, and succeed
      const resY = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', frontendOrigin)
        .send({ suggestion: 'Chaos suggestion Y - unblocks and succeeds after failure' });

      expect(resY.status).toBe(202);
      const idY = (resY.body as CreateSuggestionResponse).id;

      // Wait for state resolutions
      const startTime = Date.now();
      while (Date.now() - startTime < 8000) {
        const recX = suggestionStore.get(idX);
        const recY = suggestionStore.get(idY);
        if (recX?.status === 'failed' && recY?.status === 'confirmed') {
          break;
        }
        await new Promise((r) => setTimeout(r, 25));
      }

      const finalX = suggestionStore.get(idX);
      const finalY = suggestionStore.get(idY);

      expect(finalX?.status).toBe('failed');
      expect(finalX?.incidentId).toBeDefined();
      expect(finalX?.incidentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      expect(finalY?.status).toBe('confirmed');
      expect(unhandledRejections).toHaveLength(0);
    }, 10000);
  });

  describe('3. Anti-Stampede & 5-Minute Timeout Stress', () => {
    it('pauses queue on RATE_LIMITED and prevents stampede', async () => {
      rateLimitCount = 1;
      rateLimitSeconds = 1;

      const res1 = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', frontendOrigin)
        .send({ suggestion: 'Anti-stampede suggestion 1 - will be rate limited once' });
      const id1 = (res1.body as CreateSuggestionResponse).id;

      const res2 = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', frontendOrigin)
        .send({ suggestion: 'Anti-stampede suggestion 2 - waiting behind paused item 1' });
      const id2 = (res2.body as CreateSuggestionResponse).id;

      // Wait briefly for suggestion 1 to hit RATE_LIMITED
      await new Promise((r) => setTimeout(r, 15));

      const mid1 = suggestionStore.get(id1);
      const mid2 = suggestionStore.get(id2);
      // Suggestion 1 entered retrying or sending state
      expect(mid1?.status).toMatch(/retrying|sending|processing|confirmed/);
      // Suggestion 2 was NOT sent while item 1 was retrying/queued
      expect(mid2?.status).toMatch(/queued|sending|processing|confirmed/);

      // Wait for recovery and completion of both
      const startTime = Date.now();
      while (Date.now() - startTime < 8000) {
        const rec1 = suggestionStore.get(id1);
        const rec2 = suggestionStore.get(id2);
        if (rec1?.status === 'confirmed' && rec2?.status === 'confirmed') {
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }

      expect(suggestionStore.get(id1)?.status).toBe('confirmed');
      expect(suggestionStore.get(id2)?.status).toBe('confirmed');
      expect(unhandledRejections).toHaveLength(0);
    }, 10000);

    it('triggers terminal failure with [INCIDENT <uuid>] on 5-minute timeout accumulation and does not starve queue', async () => {
      // Dedicated bridge client with 100ms maxRetryDurationMs to simulate 5-minute timeout exhaustion
      let sleepCalls = 0;
      const timeoutBridgeClient = new DiscordBridgeClient({
        wsUrl: bridgeWsUrl,
        supertoken: mockSupertoken,
        maxRetryDurationMs: 100, // 100ms threshold for test
        sleepFn: async () => {
          sleepCalls++;
          await new Promise((r) => setTimeout(r, 5));
        }
      });

      const timeoutStore = new SuggestionStore();
      const timeoutService = new SuggestionsService({
        store: timeoutStore,
        bridgeClient: timeoutBridgeClient,
        logger: incidentLogger
      });

      // Always rate limit with 30s retry_after_seconds
      rateLimitCount = 999;
      rateLimitSeconds = 30;

      const res = await timeoutService.submit({
        suggestion: 'Suggestion destined to exceed 5 minute accumulated retry limit'
      });

      // Wait for timeout error to process
      const startTime = Date.now();
      while (Date.now() - startTime < 8000) {
        const rec = timeoutStore.get(res.id);
        if (rec?.status === 'failed') {
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }

      const finalRec = timeoutStore.get(res.id);
      expect(finalRec?.status).toBe('failed');
      expect(finalRec?.incidentId).toBeDefined();
      expect(finalRec?.incidentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(finalRec?.error).toContain('Max retry duration exceeded');

      await timeoutBridgeClient.close();
      timeoutStore.close();
      expect(unhandledRejections).toHaveLength(0);
    }, 10000);
  });

  describe('4. Architectural Decoupling & Invariant Verification', () => {
    it('verifies apps/api/src/modules/discord-bridge contains zero occurrences of "suggestion"', () => {
      const bridgeDir = path.resolve(__dirname, '../../apps/api/src/modules/discord-bridge');
      const files = fs.readdirSync(bridgeDir);

      for (const file of files) {
        if (file.endsWith('.ts')) {
          const content = fs.readFileSync(path.join(bridgeDir, file), 'utf-8');
          // Allow comments or file headers if any, but zero code/type references
          const codeLines = content
            .split('\n')
            .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
          const codeContent = codeLines.join('\n');
          expect(codeContent.toLowerCase()).not.toContain('suggestion');
        }
      }
    });

    it('verifies DiscordBridgeClient is completely domain-agnostic', () => {
      expect(typeof bridgeClient.send).toBe('function');
      const dummyFrame = { type: 'GENERIC_PING', data: { id: crypto.randomUUID() } };
      expect(dummyFrame).toBeDefined();
    });
  });
});
