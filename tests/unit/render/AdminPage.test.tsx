import type { AuthUser } from '@rcl/contracts';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthControls } from '../../../apps/web/src/features/auth/components/AuthControls.js';
import {
  AuthContext,
  type AuthState
} from '../../../apps/web/src/features/auth/components/AuthProvider.js';
import { SiteLayout } from '../../../apps/web/src/site/layout/SiteLayout.js';
import { AdminPage } from '../../../apps/web/src/site/pages/admin/AdminPage.js';

const admin: AuthUser = {
  discordId: '123',
  username: 'admin',
  globalName: null,
  avatarHash: null,
  role: 'admin'
};

function renderSession(state: AuthState, signingOut = false, path = '/admin') {
  return renderToString(
    <AuthContext.Provider
      value={{ state, signingOut, logoutError: false, retry: () => {}, logout: async () => {} }}
    >
      <SiteLayout>
        <AdminPage path={path} />
      </SiteLayout>
    </AuthContext.Provider>
  );
}

describe('administration access', () => {
  it.each([
    [{ status: 'loading' }, 'Comprobando acceso'],
    [{ status: 'anonymous' }, 'Inicia sesión'],
    [{ status: 'error' }, 'No se pudo comprobar tu sesión'],
    [{ status: 'authenticated', user: { ...admin, role: 'viewer' } }, 'No tienes permisos']
  ] satisfies [AuthState, string][])(
    'does not mount the upload console for %j',
    (state, message) => {
      const html = renderSession(state);
      expect(html).toContain(message);
      expect(html).not.toContain('ROFL Replay Upload');
      expect(html).not.toContain('Dropzone for ROFL and ZIP files');
      expect(html).not.toContain('href="/admin"');
    }
  );

  it('mounts replay upload for a verified administrator and places admin last in navigation', () => {
    const html = renderSession(
      { status: 'authenticated', user: admin },
      false,
      '/admin/rofl/upload'
    );
    expect(html).toContain('Dropzone for ROFL and ZIP files');
    expect(html).toContain('href="/admin"');
    const navigation = html.match(/<nav\b[^>]*id="site-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    expect(navigation).toBeDefined();
    expect(navigation).toMatch(/<a\b[^>]*href="\/admin"[^>]*>Administración<\/a>$/);
    expect(html.match(/href="\/admin"/g)).toHaveLength(1);
  });

  it('offers exactly two admin subpages and keeps CRUD entities inside their panel', () => {
    const html = renderSession({ status: 'authenticated', user: admin });
    expect(html).toContain('href="/admin/rofl/upload"');
    expect(html).toContain('href="/admin/crud"');
    expect(html).not.toContain('Dropzone for ROFL and ZIP files');
    expect(html).not.toContain('href="/admin/teams"');
    const crud = renderSession({ status: 'authenticated', user: admin }, false, '/admin/crud');
    expect(crud).toContain('Cargando administración');
    expect(crud).not.toContain('Dropzone for ROFL and ZIP files');
  });

  it('blocks the upload console and account link while logout is pending', () => {
    const html = renderSession({ status: 'authenticated', user: admin }, true);
    expect(html).not.toContain('Dropzone for ROFL and ZIP files');
    expect(html).not.toContain('href="/admin"');
    expect(html).toContain('Cerrando sesión');
  });

  it('fails closed when mounted without the session provider', () => {
    const html = renderToString(
      <>
        <AuthControls />
        <AdminPage />
      </>
    );
    expect(html).toContain('Comprobando acceso');
    expect(html).not.toContain('Dropzone for ROFL and ZIP files');
  });

  it('rejects unknown roles even if a malformed user bypasses session parsing', () => {
    const html = renderSession({
      status: 'authenticated',
      user: { ...admin, role: 'owner' } as unknown as AuthUser
    });
    expect(html).toContain('No tienes permisos');
    expect(html).not.toContain('Dropzone for ROFL and ZIP files');
  });
});
