import type { AuthUser } from '@rcl/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endSession, getSession } from '../../apps/web/src/features/auth/api/auth-api.js';

const user: AuthUser = {
  discordId: '123456789012345678',
  username: 'rcl-player',
  globalName: 'Jugador RCL',
  avatarHash: null,
  role: 'viewer'
};

afterEach(() => vi.unstubAllGlobals());

describe('Discord session API', () => {
  it.each(['viewer', 'admin', 'owner'] as const)('accepts the persisted %s role', async (role) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ...user, role } })))
    );
    await expect(getSession()).resolves.toEqual({ ...user, role });
  });
  it('rejects an unknown role', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ data: { ...user, role: 'superadmin' } })))
    );
    await expect(getSession()).rejects.toThrow('no es válida');
  });
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
