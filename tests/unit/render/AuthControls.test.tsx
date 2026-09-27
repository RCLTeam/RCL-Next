import type { AuthUser } from '@rcl/contracts';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { discordLoginUrl } from '../../../apps/web/src/features/auth/api/auth-api.js';
import { AuthControlsView } from '../../../apps/web/src/features/auth/components/AuthControls.js';

const user: AuthUser = {
  discordId: '123456789012345678',
  username: 'rcl-player',
  globalName: 'Jugador RCL',
  avatarHash: null,
  role: 'viewer'
};

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
