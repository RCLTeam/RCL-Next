import type { AuthUser } from '@rcl/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthContext, canAccessAdmin } from '../../../features/auth/components/AuthProvider.js';
import { AdminPage } from './AdminPage.js';

function render(role: AuthUser['role'], path = '/admin') {
  return renderToStaticMarkup(
    <AuthContext.Provider
      value={{
        state: {
          status: 'authenticated',
          user: { discordId: '123', username: 'user', globalName: null, avatarHash: null, role }
        },
        signingOut: false,
        logoutError: false,
        retry: () => {},
        logout: async () => {}
      }}
    >
      <AdminPage path={path} />
    </AuthContext.Provider>
  );
}

describe('editor administration access', () => {
  it.each(['/admin', '/admin/home-content'])('shows only Home Content at %s', (path) => {
    const html = render('editor', path);
    expect(html).toContain('Team of the Week');
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
      const html = render('editor', `/admin/${section}`);
      expect(html).toContain('No tienes permisos para acceder a esta sección.');
      expect(html).not.toContain('Team of the Week');
    }
  );
  it.each(['admin', 'owner'] as const)('preserves all sections for %s', (role) => {
    const html = render(role);
    expect(html).toContain('href="/admin/member-roles"');
    expect(html).toContain('href="/admin/database-transfer"');
  });
  it('denies viewers and enables the admin navigation entry for editors', () => {
    expect(render('viewer')).toContain('No tienes permisos de administración.');
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
