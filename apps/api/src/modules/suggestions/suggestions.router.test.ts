import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../shared/http.js';
import type { AuthService } from '../auth/auth.service.js';
import { createSuggestionsRouter } from './suggestions.router.js';
import type { SuggestionsService } from './suggestions.service.js';

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
        expect.objectContaining({ discordId: '987654321' })
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
        undefined
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
