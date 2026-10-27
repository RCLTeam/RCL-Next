import type { AuthUser } from '@rcl/contracts';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthControls } from '../../../features/auth/components/AuthControls.js';
import {
  AuthContext,
  type AuthState,
  canAccessAdmin
} from '../../../features/auth/components/AuthProvider.js';
import { MemberRolesTable } from '../../../features/member-roles/components/MemberRolesPanel.js';
import { SiteLayout } from '../../layout/SiteLayout.js';
import { AdminPage } from './AdminPage.js';

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
  it('mounts logo management for administrators', () => {
    const html = renderSession(
      { status: 'authenticated', user: admin },
      false,
      '/admin/team-logos'
    );
    expect(html).toContain('Team Logos');
    expect(html).toContain('Subir logo');
    expect(html).toContain('Cargando logos');
    expect(html).toContain('href="/admin/team-logos"');
  });
  it.each(['admin', 'owner'] as const)(
    'shows member roles to %s and restricts editing to owners',
    (role) => {
      const html = renderSession(
        { status: 'authenticated', user: { ...admin, role } },
        false,
        '/admin/member-roles'
      );
      expect(html).toContain('Cargando miembros');
      expect(html).toContain('Gestión de roles');
      const table = renderToString(
        <MemberRolesTable
          members={[admin]}
          canManage={role === 'owner'}
          disabled={false}
          onChange={() => {}}
        />
      );
      expect(table).toContain(admin.username);
      if (role === 'owner') {
        expect(table).toContain('<select');
        expect(table).toContain('value="owner"');
      } else {
        expect(table).not.toContain('<select');
        expect(table).not.toContain('Cambiar rol');
      }
    }
  );
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

  it('offers four admin subpages and keeps CRUD entities inside their panel', () => {
    const html = renderSession({ status: 'authenticated', user: admin });
    expect(html).toContain('href="/admin/rofl/upload"');
    expect(html).toContain('href="/admin/crud"');
    expect(html).toContain('href="/admin/member-roles"');
    expect(html).toContain('href="/admin/database-transfer"');
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
      user: { ...admin, role: 'unknown' } as unknown as AuthUser
    });
    expect(html).toContain('No tienes permisos');
    expect(html).not.toContain('Dropzone for ROFL and ZIP files');
  });
});

describe('editor administration access', () => {
  it.each(['/admin', '/admin/home-content'])('shows only Home Content at %s', (path) => {
    const html = renderSession(
      { status: 'authenticated', user: { ...admin, role: 'editor' } },
      false,
      path
    );
    expect(html).toContain('Team of the Week');
    const homeLink = html.match(/<a\b[^>]*href="\/admin\/home-content"[^>]*>/)?.[0];
    expect(homeLink).toContain('aria-current="page"');
    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/admin/home-content"');
    for (const section of [
      'rofl/upload',
      'crud',
      'member-roles',
      'team-logos',
      'database-transfer'
    ]) {
      expect(html).not.toContain(`href="/admin/${section}"`);
    }
  });
  it.each(['rofl/upload', 'crud', 'member-roles', 'team-logos', 'database-transfer'])(
    'blocks direct editor navigation to %s',
    (section) => {
      const html = renderSession(
        { status: 'authenticated', user: { ...admin, role: 'editor' } },
        false,
        `/admin/${section}`
      );
      expect(html).toContain('No tienes permisos para acceder a esta sección.');
      expect(html).not.toContain('Team of the Week');
    }
  );
  it.each(['admin', 'owner'] as const)('preserves all sections for %s', (role) => {
    const html = renderSession({ status: 'authenticated', user: { ...admin, role } });
    expect(html).toContain('href="/admin/member-roles"');
    expect(html).toContain('href="/admin/database-transfer"');
  });
  it('denies viewers and enables the admin navigation entry for editors', () => {
    expect(
      renderSession({ status: 'authenticated', user: { ...admin, role: 'viewer' } })
    ).toContain('No tienes permisos de administración.');
    expect(
      canAccessAdmin({
        status: 'authenticated',
        user: {
          discordId: '123',
          username: 'editor',
          globalName: null,
          avatarHash: null,
          role: 'editor'
        }
      })
    ).toBe(true);
  });
});
