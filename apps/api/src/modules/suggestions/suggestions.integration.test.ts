import { EventEmitter } from 'node:events';
import type express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import type { CompetitionRepository } from '../competition/competition.repository.js';
import {
  BridgeRateLimitTimeoutError,
  type DiscordBridgeClient
} from '../discord-bridge/discord-bridge.client.js';
import { IncidentLogger } from './incident-logger.js';
import { SuggestionStore } from './suggestion.store.js';
import { SuggestionsService } from './suggestions.service.js';

class MockDiscordBridgeClient extends EventEmitter {
  public checkHealth = vi.fn();
  public send = vi.fn().mockResolvedValue(undefined);
}

describe('Suggestions Integration (Full App Pipeline)', () => {
  let app: express.Express;
  let mockBridgeClient: MockDiscordBridgeClient;
  let suggestionStore: SuggestionStore;
  let incidentLogger: IncidentLogger;
  let suggestionsService: SuggestionsService;
  const corsOrigin = 'http://localhost:5173';

  beforeEach(() => {
    mockBridgeClient = new MockDiscordBridgeClient();
    suggestionStore = new SuggestionStore();
    incidentLogger = new IncidentLogger();
    suggestionsService = new SuggestionsService({
      store: suggestionStore,
      bridgeClient: mockBridgeClient as unknown as DiscordBridgeClient,
      logger: incidentLogger
    });

    app = createApp({
      repository: {} as CompetitionRepository,
      checkDatabase: async () => {},
      corsOrigin,
      bridgeClient: mockBridgeClient as unknown as DiscordBridgeClient,
      suggestionStore,
      incidentLogger,
      suggestionsService
    });
  });

  describe('GET /api/v1/bridge/health through app pipeline', () => {
    it('responds with 200 OK when bridge probe reports connected', async () => {
      mockBridgeClient.checkHealth.mockResolvedValueOnce({
        status: 'connected',
        healthy: true,
        message: 'Conexión correcta'
      });

      const res = await request(app).get('/api/v1/bridge/health');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        status: 'connected',
        healthy: true,
        message: 'Conexión correcta'
      });
    });

    it('responds with 503 Service Unavailable when bridge probe reports failure', async () => {
      mockBridgeClient.checkHealth.mockResolvedValueOnce({
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      });

      const res = await request(app).get('/api/v1/bridge/health');

      expect(res.status).toBe(503);
      expect(res.body.healthy).toBe(false);
      expect(res.body.status).toBe('unreachable');
    });
  });

  describe('End-to-end suggestion flow (POST 202 -> polling GET 200 -> Confirmed)', () => {
    it('completes the suggestion lifecycle successfully', async () => {
      mockBridgeClient.send.mockResolvedValueOnce(undefined);

      // Step 1: Submit suggestion
      const postRes = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', corsOrigin)
        .send({
          suggestion: 'Sugerencia de prueba de integración completa',
          isAnonymous: true
        });

      expect(postRes.status).toBe(202);
      expect(postRes.body.id).toBeDefined();
      expect(postRes.body.status).toBe('queued');
      const suggestionId = postRes.body.id;

      // Allow microtask tick for dispatchToBridge to execute Phase 1
      await new Promise((r) => setTimeout(r, 10));

      // Step 2: Poll status post Phase 1
      const pollRes1 = await request(app).get(`/api/v1/suggestions/status/${suggestionId}`);
      expect(pollRes1.status).toBe(200);
      expect(pollRes1.body.status).toBe('processing');

      // Step 3: Trigger Phase 2 confirmation
      mockBridgeClient.emit('SUGGESTION_CONFIRMED', {
        id: suggestionId,
        channel_id: 'chan-123',
        message_id: 'msg-456'
      });

      // Step 4: Poll status post Phase 2
      const pollRes2 = await request(app).get(`/api/v1/suggestions/status/${suggestionId}`);
      expect(pollRes2.status).toBe(200);
      expect(pollRes2.body.status).toBe('confirmed');
    });
  });

  describe('End-to-end failure flow with incident logging', () => {
    it('handles bridge rate limit timeout with failed status and incidentId', async () => {
      mockBridgeClient.send.mockRejectedValueOnce(
        new BridgeRateLimitTimeoutError('Max retry duration exceeded', 'incident-term-777')
      );

      const postRes = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', corsOrigin)
        .send({
          suggestion: 'Sugerencia que fallará con timeout terminal'
        });

      expect(postRes.status).toBe(202);
      const suggestionId = postRes.body.id;

      // Allow microtask tick for dispatchToBridge rejection
      await new Promise((r) => setTimeout(r, 10));

      const pollRes = await request(app).get(`/api/v1/suggestions/status/${suggestionId}`);
      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe('failed');
      expect(pollRes.body.incidentId).toBe('incident-term-777');
    });
  });

  describe('CSRF barrier on the full app', () => {
    it('returns 403 Forbidden when Origin header is missing', async () => {
      const res = await request(app)
        .post('/api/v1/suggestions')
        .send({ suggestion: 'Sugerencia sin header de origen' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVALID_ORIGIN');
    });
  });

  describe('404 handler for unknown routes', () => {
    it('returns 404 for unknown route under /api/v1/suggestions', async () => {
      const res = await request(app).get('/api/v1/suggestions/unknown-route');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
