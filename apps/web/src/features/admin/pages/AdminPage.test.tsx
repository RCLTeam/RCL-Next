import type { AuthUser } from '@rcl/contracts';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthControls } from '../../auth/components/AuthControls.js';
import { AuthContext, type AuthState } from '../../auth/components/AuthProvider.js';
import { SiteLayout } from '../../site/components/SiteLayout.js';
import { AdminPage } from './AdminPage.js';

const admin: AuthUser = {
  discordId: '123',
  username: 'admin',
  globalName: null,
  avatarHash: null,
  role: 'admin'
};

function renderSession(state: AuthState, signingOut = false) {
  return renderToString(
    <AuthContext.Provider
      value={{ state, signingOut, logoutError: false, retry: () => {}, logout: async () => {} }}
    >
      <SiteLayout>
        <AdminPage />
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

  it('mounts replay upload for a verified administrator and keeps admin out of public navigation', () => {
    const html = renderSession({ status: 'authenticated', user: admin });
    expect(html).toContain('Dropzone for ROFL and ZIP files');
    expect(html).toContain('href="/admin"');
    const navigation = html.match(/<nav\b[^>]*id="site-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    expect(navigation).toBeDefined();
    expect(navigation).not.toContain('href="/admin"');
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
