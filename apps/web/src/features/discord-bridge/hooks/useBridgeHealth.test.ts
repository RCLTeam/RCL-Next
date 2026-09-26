import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UseBridgeHealthReturn } from '../types/bridge.types.js';
import { fetchBridgeHealth, useBridgeHealth } from './useBridgeHealth.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useBridgeHealth hook & transport integration', () => {
  it('resolves 200 OK to healthy connected status', async () => {
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
    expect(result.status).toBe('connected');
    expect(result.message).toBe('Conexión correcta');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/bridge/health',
      expect.objectContaining({
        credentials: 'include',
        signal: controller.signal
      })
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

  it('resolves 503 Service Unavailable to authentication_failed status with token error', async () => {
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

  it('catches network rejection and returns unreachable fallback without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await fetchBridgeHealth();

    expect(result.healthy).toBe(false);
    expect(result.status).toBe('unreachable');
    expect(result.message).toBe('No se puede llegar a él');
  });

  it('renders initial loading state in React test harness', () => {
    let capturedHook: UseBridgeHealthReturn | null = null;

    function testHarness() {
      const hook = useBridgeHealth();
      capturedHook = hook;
      return React.createElement(
        'div',
        { 'data-testid': 'status' },
        hook.isLoading ? 'loading' : 'ready'
      );
    }

    const html = renderToString(React.createElement(testHarness));

    expect(html).toContain('loading');
    expect(capturedHook).not.toBeNull();
    const hook = capturedHook as unknown as UseBridgeHealthReturn;
    expect(hook.isLoading).toBe(true);
    expect(hook.isHealthy).toBe(false);
    expect(hook.data).toBeNull();
    expect(typeof hook.refetch).toBe('function');
  });
});
