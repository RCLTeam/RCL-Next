import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBridgeHealth } from './bridge-api.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchBridgeHealth API client', () => {
  it('resolves 200 OK to healthy connected response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        status: 'connected',
        healthy: true,
        message: 'Conexión correcta'
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const result = await fetchBridgeHealth({ signal: controller.signal });

    expect(result.healthy).toBe(true);
    expect(result.status).toBe('connected');
    expect(result.message).toBe('Conexión correcta');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/bridge/health', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal
    });
  });

  it('accepts direct AbortSignal parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        status: 'connected',
        healthy: true,
        message: 'Conexión correcta'
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const result = await fetchBridgeHealth(controller.signal);

    expect(result.healthy).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/bridge/health',
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('resolves 503 Service Unavailable to unreachable status with diagnostic details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          status: 'unreachable',
          healthy: false,
          message: 'No se puede llegar a él',
          details:
            'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
        },
        { status: 503 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchBridgeHealth();

    expect(result.healthy).toBe(false);
    expect(result.status).toBe('unreachable');
    expect(result.message).toBe('No se puede llegar a él');
    expect(result.details).toContain('El websocket no pudo iniciarse');
  });

  it('resolves 503 Service Unavailable to authentication_failed status with details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          status: 'authentication_failed',
          healthy: false,
          message: 'No se pudo autenticar',
          details:
            'Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env'
        },
        { status: 503 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchBridgeHealth();

    expect(result.healthy).toBe(false);
    expect(result.status).toBe('authentication_failed');
    expect(result.message).toBe('No se pudo autenticar');
    expect(result.details).toContain('revisen el super token en env');
  });

  it('returns fallback unreachable response when server returns unexpected status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error'
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchBridgeHealth();

    expect(result.healthy).toBe(false);
    expect(result.status).toBe('unreachable');
    expect(result.message).toBe('No se puede llegar a él');
    expect(result.details).toContain('500');
  });

  it('catches network rejection and returns structured failure without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await fetchBridgeHealth();

    expect(result.healthy).toBe(false);
    expect(result.status).toBe('unreachable');
    expect(result.message).toBe('No se puede llegar a él');
    expect(result.details).toContain('Failed to fetch');
  });

  it('propagates abort error if signal was aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchBridgeHealth(controller.signal)).rejects.toThrow();
  });
});
