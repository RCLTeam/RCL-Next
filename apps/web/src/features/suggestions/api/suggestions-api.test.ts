import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSuggestion, getSuggestionStatus } from './suggestions-api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('suggestions API client', () => {
  describe('createSuggestion', () => {
    it('sends POST /api/v1/suggestions and returns 202 response payload', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json(
          {
            id: 'sug-abc-123',
            status: 'queued'
          },
          { status: 202 }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      const controller = new AbortController();
      const requestPayload = {
        suggestion: 'Sugerencia comunitaria de prueba válida',
        isAnonymous: false
      };

      const result = await createSuggestion(requestPayload, { signal: controller.signal });

      expect(result.id).toBe('sug-abc-123');
      expect(result.status).toBe('queued');
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/suggestions', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });
    });

    it('accepts direct AbortSignal parameter', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json(
          {
            id: 'sug-direct-sig',
            status: 'queued'
          },
          { status: 202 }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      const controller = new AbortController();
      const result = await createSuggestion(
        { suggestion: 'Texto válido con señal directa' },
        controller.signal
      );

      expect(result.id).toBe('sug-direct-sig');
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/suggestions',
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('throws error message from JSON response on 400 Bad Request', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json(
          {
            message: 'La sugerencia debe tener entre 10 y 1000 caracteres.'
          },
          { status: 400 }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(createSuggestion({ suggestion: 'Corto' })).rejects.toThrow(
        'La sugerencia debe tener entre 10 y 1000 caracteres.'
      );
    });

    it('throws fallback error message on 500 without JSON message', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('Internal Error', { status: 500 }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        createSuggestion({ suggestion: 'Texto suficientemente largo para validación' })
      ).rejects.toThrow('Error al enviar la sugerencia (500)');
    });
    it('shows a wait message with the minutes from Retry-After on 429 RATE_LIMITED', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'RATE_LIMITED', message: 'Too many suggestions. Try again later.' } },
            { status: 429, headers: { 'Retry-After': '540' } }
          )
        );
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        createSuggestion({ suggestion: 'Texto suficientemente largo para validación' })
      ).rejects.toThrow(
        'Has enviado demasiadas sugerencias. Vuelve a intentarlo dentro de 9 minutos.'
      );
    });

    it.each(['SUGGESTIONS_NOT_CONFIGURED', 'SUGGESTIONS_UNAVAILABLE'])(
      'shows a service unavailable message on 503 %s',
      async (code) => {
        const fetchMock = vi
          .fn()
          .mockResolvedValue(
            Response.json({ error: { code, message: 'internal' } }, { status: 503 })
          );
        vi.stubGlobal('fetch', fetchMock);

        await expect(
          createSuggestion({ suggestion: 'Texto suficientemente largo para validación' })
        ).rejects.toThrow(
          'El servicio de sugerencias no está disponible en este momento. Inténtalo más tarde.'
        );
      }
    );

    it('uses the message of the API error envelope', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Suggestion text is required.' } },
            { status: 400 }
          )
        );
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        createSuggestion({ suggestion: 'Texto suficientemente largo para validación' })
      ).rejects.toThrow('Suggestion text is required.');
    });
  });

  describe('getSuggestionStatus', () => {
    it('sends GET /api/v1/suggestions/status/:id and returns 200 payload', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json({
          id: 'sug-status-1',
          status: 'processing'
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await getSuggestionStatus('sug-status-1');

      expect(result.id).toBe('sug-status-1');
      expect(result.status).toBe('processing');
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/suggestions/status/sug-status-1', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
    });

    it('encodes special characters in id', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json({
          id: 'id with spaces',
          status: 'queued'
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      await getSuggestionStatus('id with spaces');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/suggestions/status/id%20with%20spaces',
        expect.anything()
      );
    });

    it('returns retrying status with countdown and details', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json({
          id: 'sug-retry-1',
          status: 'retrying',
          nextRetryInSeconds: 30
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await getSuggestionStatus('sug-retry-1');

      expect(result.status).toBe('retrying');
      expect(result.nextRetryInSeconds).toBe(30);
    });

    it('throws error when status request returns 404', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json(
          {
            message: 'Sugerencia no encontrada o expirada.'
          },
          { status: 404 }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(getSuggestionStatus('non-existent')).rejects.toThrow(
        'Sugerencia no encontrada o expirada.'
      );
    });
  });
});
