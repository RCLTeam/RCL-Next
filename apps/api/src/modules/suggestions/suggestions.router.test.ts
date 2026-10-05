import { EventEmitter } from 'node:events';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../shared/http.js';
import type { AuthService } from '../auth/auth.service.js';
import type { DiscordBridgeClient } from '../discord-bridge/discord-bridge.client.js';
import { IncidentLogger } from './incident-logger.js';
import { SuggestionRateLimiter } from './suggestion-rate-limiter.js';
import { SuggestionStore } from './suggestion.store.js';
import { createSuggestionsRouter } from './suggestions.router.js';
import { SuggestionsService } from './suggestions.service.js';

interface MockSuggestionsService {
  submit: ReturnType<typeof vi.fn>;
  submitSuggestion: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
}

describe('suggestions.router', () => {
  let app: express.Express;
  let mockService: MockSuggestionsService;
  const trustedOrigin = 'http://localhost:5173';

  beforeEach(() => {
    mockService = {
      submit: vi.fn(),
      submitSuggestion: vi.fn(),
      getStatus: vi.fn()
    };

    app = express();
    app.use(express.json());
    app.use(
      '/api/v1/suggestions',
      createSuggestionsRouter({
        suggestionsService: mockService as unknown as SuggestionsService,
        frontendOrigin: trustedOrigin
      })
    );
    app.use(errorHandler);
  });

  describe('POST /api/v1/suggestions', () => {
    it('returns 202 Accepted with id and status when input and origin are valid', async () => {
      mockService.submit.mockResolvedValueOnce({
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'queued'
      });

      const res = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', trustedOrigin)
        .send({ suggestion: 'Sugerencia válida de prueba', isAnonymous: false });

      expect(res.status).toBe(202);
      expect(res.body).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'queued'
      });
    });

    it('rejects untrusted origin with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', 'http://untrusted-site.com')
        .send({ suggestion: 'Intento malicioso de sugerencia' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVALID_ORIGIN');
    });

    it('rejects missing origin header with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/suggestions')
        .send({ suggestion: 'Sin cabecera de origen' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVALID_ORIGIN');
    });

    it('returns 400 Bad Request when suggestion text < 10 characters', async () => {
      const res = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', trustedOrigin)
        .send({ suggestion: 'Corta' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 Bad Request when suggestion text > 1000 characters', async () => {
      const res = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', trustedOrigin)
        .send({ suggestion: 'X'.repeat(1001) });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects non-string or missing suggestion body with 400 Bad Request', async () => {
      const res1 = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', trustedOrigin)
        .send({});

      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('VALIDATION_ERROR');

      const res2 = await request(app)
        .post('/api/v1/suggestions')
        .set('Origin', trustedOrigin)
        .send({ suggestion: 1234567890 });

      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('resolves authenticated user via session cookie when auth is provided', async () => {
      const mockAuthService = {
        currentUser: vi.fn().mockResolvedValue({
          discordId: '987654321',
          username: 'AuthGamer',
          globalName: 'Auth Gamer Global',
          avatarHash: 'avatarhash123',
          role: 'viewer'
        })
      };

      const authApp = express();
      authApp.use(express.json());
      authApp.use(
        '/api/v1/suggestions',
        createSuggestionsRouter({
          suggestionsService: mockService as unknown as SuggestionsService,
          frontendOrigin: trustedOrigin,
          auth: {
            service: mockAuthService as unknown as AuthService,
            secureCookies: false,
            frontendOrigin: trustedOrigin
          }
        })
      );
      authApp.use(errorHandler);

      mockService.submit.mockResolvedValueOnce({
        id: 'uuid-auth-123',
        status: 'queued'
      });

      const res = await request(authApp)
        .post('/api/v1/suggestions')
        .set('Origin', trustedOrigin)
        .set('Cookie', 'rcl_session=valid-token')
        .send({ suggestion: 'Sugerencia de usuario autenticado', isAnonymous: false });

      expect(res.status).toBe(202);
      expect(mockAuthService.currentUser).toHaveBeenCalledWith('valid-token');
      expect(mockService.submit).toHaveBeenCalledWith(
        { suggestion: 'Sugerencia de usuario autenticado', isAnonymous: false },
        expect.objectContaining({ discordId: '987654321' }),
        expect.objectContaining({ clientIp: expect.any(String) })
      );
    });

    it('proceeds as anonymous if session cookie token fails verification', async () => {
      const mockAuthService = {
        currentUser: vi.fn().mockRejectedValue(new Error('Invalid token'))
      };

      const authApp = express();
      authApp.use(express.json());
      authApp.use(
        '/api/v1/suggestions',
        createSuggestionsRouter({
          suggestionsService: mockService as unknown as SuggestionsService,
          frontendOrigin: trustedOrigin,
          auth: {
            service: mockAuthService as unknown as AuthService,
            secureCookies: false,
            frontendOrigin: trustedOrigin
          }
        })
      );
      authApp.use(errorHandler);

      mockService.submit.mockResolvedValueOnce({
        id: 'uuid-auth-anon',
        status: 'queued'
      });

      const res = await request(authApp)
        .post('/api/v1/suggestions')
        .set('Origin', trustedOrigin)
        .set('Cookie', 'rcl_session=bad-token')
        .send({ suggestion: 'Sugerencia con token caducado', isAnonymous: false });

      expect(res.status).toBe(202);
      expect(mockService.submit).toHaveBeenCalledWith(
        { suggestion: 'Sugerencia con token caducado', isAnonymous: false },
        undefined,
        expect.objectContaining({ clientIp: expect.any(String) })
      );
    });
  });

  describe('GET /api/v1/suggestions/status/:id', () => {
    it('returns 200 with status response and Cache-Control: no-store for known ID', async () => {
      mockService.getStatus.mockReturnValueOnce({
        id: 'uuid-existing',
        status: 'retrying',
        nextRetryInSeconds: 15
      });

      const res = await request(app).get('/api/v1/suggestions/status/uuid-existing');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        id: 'uuid-existing',
        status: 'retrying',
        nextRetryInSeconds: 15
      });
    });

    it('returns 404 Not Found for unknown ID', async () => {
      mockService.getStatus.mockReturnValueOnce(null);

      const res = await request(app).get('/api/v1/suggestions/status/unknown-id');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns error details and incidentId when suggestion has failed', async () => {
      mockService.getStatus.mockReturnValueOnce({
        id: 'uuid-fail',
        status: 'failed',
        incidentId: 'incident-444',
        error: 'Discord unreachable'
      });

      const res = await request(app).get('/api/v1/suggestions/status/uuid-fail');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 'uuid-fail',
        status: 'failed',
        incidentId: 'incident-444',
        error: 'Discord unreachable'
      });
    });
  });
});

describe('suggestions.router with SuggestionsService (limits)', () => {
  const trustedOrigin = 'http://localhost:5173';

  class FakeBridge extends EventEmitter {
    public send = vi.fn().mockResolvedValue(undefined);
    public isConfigured = vi.fn().mockReturnValue(true);
    public hasCapacity = vi.fn().mockReturnValue(true);
  }

  function buildApp(options: { store?: SuggestionStore; rateLimiter?: SuggestionRateLimiter }) {
    const bridge = new FakeBridge();
    const store = options.store ?? new SuggestionStore({ enablePeriodicCleanup: false });
    const service = new SuggestionsService({
      bridgeClient: bridge as unknown as DiscordBridgeClient,
      store,
      logger: new IncidentLogger(() => {}),
      rateLimiter: options.rateLimiter
    });
    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1/suggestions',
      createSuggestionsRouter({ suggestionsService: service, frontendOrigin: trustedOrigin })
    );
    app.use(errorHandler);
    return { app, bridge, store };
  }

  const post = (app: express.Express, suggestion: string) =>
    request(app).post('/api/v1/suggestions').set('Origin', trustedOrigin).send({ suggestion });

  it('responds 429 with Retry-After once the same IP exceeds the anonymous limit', async () => {
    const { app, bridge } = buildApp({
      rateLimiter: new SuggestionRateLimiter({ anonymous: { limit: 3, windowMs: 10 * 60 * 1000 } })
    });

    for (let i = 0; i < 3; i++) {
      expect((await post(app, `Sugerencia anónima número ${i}`)).status).toBe(202);
    }
    const limited = await post(app, 'Sugerencia anónima de más');

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(600);
    expect(bridge.send).toHaveBeenCalledTimes(3);
  });

  it('applies the default limiter when none is configured', async () => {
    const { app } = buildApp({});
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await post(app, `Sugerencia por defecto ${i}`)).status);
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
  });

  it('responds 503 and keeps the store size when the store is full', async () => {
    const store = new SuggestionStore({ maxRecords: 1, enablePeriodicCleanup: false });
    const { app, bridge } = buildApp({ store });

    expect((await post(app, 'Primera sugerencia aceptada')).status).toBe(202);
    const full = await post(app, 'Segunda sugerencia rechazada');

    expect(full.status).toBe(503);
    expect(full.body.error.code).toBe('SUGGESTIONS_UNAVAILABLE');
    expect(store.size()).toBe(1);
    expect(bridge.send).toHaveBeenCalledTimes(1);
  });

  it('responds 503 SUGGESTIONS_NOT_CONFIGURED when the bridge has no URL', async () => {
    const { app, bridge, store } = buildApp({});
    bridge.isConfigured.mockReturnValue(false);

    const res = await post(app, 'Sugerencia sin puente configurado');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SUGGESTIONS_NOT_CONFIGURED');
    expect(store.size()).toBe(0);
  });
});
