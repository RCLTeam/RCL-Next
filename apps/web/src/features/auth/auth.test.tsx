import type { AuthUser } from '@rcl/contracts';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthControlsView } from './AuthControls.js';
import { discordLoginUrl, endSession, getSession } from './auth-api.js';

const user: AuthUser = {
  discordId: '123456789012345678',
  username: 'rcl-player',
  globalName: 'Jugador RCL',
  avatarHash: null,
  role: 'viewer'
};

afterEach(() => vi.unstubAllGlobals());

describe('Discord session API', () => {
  it('recognizes 401 as signed out and sends cookies', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(getSession()).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith('/api/v1/auth/me', {
      credentials: 'include',
      cache: 'no-store'
    });
  });
  it('reads the authenticated user and passes cancellation to fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: user })));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    await expect(getSession(controller.signal)).resolves.toEqual(user);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
  it.each([503, 500])('does not treat HTTP %s as an anonymous session', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(getSession()).rejects.toThrow('No se pudo comprobar la sesión');
  });
  it('rejects malformed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { role: 'admin' } })))
    );
    await expect(getSession()).rejects.toThrow('no es válida');
  });
  it('posts logout with cookies and waits for confirmation', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(endSession()).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  });
  it('reports a failed logout instead of assuming the session was revoked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(endSession()).rejects.toThrow('No se pudo cerrar la sesión');
  });
});

describe('Discord header controls', () => {
  const callbacks = { onLogout: () => {}, onRetry: () => {} };
  it('uses a navigation link to start OAuth', () => {
    const html = renderToString(
      <AuthControlsView state={{ status: 'anonymous' }} {...callbacks} />
    );
    expect(html).toContain(`href="${discordLoginUrl}"`);
    expect(html).toContain('Entrar con Discord');
    expect(html).not.toContain('Cerrar sesión');
  });
  it('shows the user, role and logout after authentication', () => {
    const html = renderToString(
      <AuthControlsView state={{ status: 'authenticated', user }} {...callbacks} />
    );
    expect(html).toContain('Jugador RCL');
    expect(html).toContain('Miembro');
    expect(html).toContain('Cerrar sesión');
    expect(html).not.toContain('Entrar con Discord');
  });
  it('disables logout while it is pending', () => {
    const html = renderToString(
      <AuthControlsView state={{ status: 'authenticated', user }} signingOut {...callbacks} />
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('Cerrando sesión');
  });
  it('provides a retry when the API is unavailable', () => {
    const html = renderToString(<AuthControlsView state={{ status: 'error' }} {...callbacks} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Reintentar');
  });
  it('preserves user information while reporting a failed logout', () => {
    const html = renderToString(
      <AuthControlsView state={{ status: 'authenticated', user }} logoutError {...callbacks} />
    );
    expect(html).toContain('Jugador RCL');
    expect(html).toContain('No se pudo cerrar la sesión');
  });
});
