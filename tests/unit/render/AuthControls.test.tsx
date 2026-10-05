import type { AuthUser } from '@rcl/contracts';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { discordLoginUrl } from '../../../apps/web/src/features/auth/api/auth-api.js';
import {
  AccountAvatarView,
  AuthControlsView
} from '../../../apps/web/src/features/auth/components/AuthControls.js';

const user: AuthUser = {
  discordId: '123456789012345678',
  username: 'rcl-player',
  globalName: 'Jugador RCL',
  avatarHash: null,
  role: 'viewer'
};

describe('Discord header controls', () => {
  const callbacks = { onLogout: () => {}, onRetry: () => {} };
  it.each(['0123456789abcdef0123456789abcdef', 'a_0123456789abcdef0123456789abcdef'])(
    'loads avatar %s through the same-origin proxy',
    (avatarHash) => {
      const html = renderToString(
        <AuthControlsView
          state={{ status: 'authenticated', user: { ...user, avatarHash } }}
          {...callbacks}
        />
      );
      expect(html).toContain(`src="/api/v1/discord-avatars/${user.discordId}/${avatarHash}"`);
      expect(html).toContain('alt="Jugador RCL"');
      expect(html).not.toContain('cdn.discordapp.com');
    }
  );
  it('does not request an avatar when the account has none', () => {
    const html = renderToString(
      <AuthControlsView state={{ status: 'authenticated', user }} {...callbacks} />
    );
    expect(html).toContain('>JU</span>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('/api/v1/discord-avatars/');
  });
  it('falls back to initials after the avatar download fails', () => {
    const html = renderToString(
      <AccountAvatarView
        user={{ ...user, avatarHash: '0123456789abcdef0123456789abcdef' }}
        failed
        onError={() => {}}
      />
    );
    expect(html).toContain('>JU</span>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('/api/v1/discord-avatars/');
  });
  it('reports avatar download errors to the fallback handler', () => {
    let errors = 0;
    const element = AccountAvatarView({
      user: { ...user, avatarHash: '0123456789abcdef0123456789abcdef' },
      failed: false,
      onError: () => {
        errors += 1;
      }
    });
    expect(element.type).toBe('img');
    const { onError } = element.props as { onError: () => void };
    onError();
    expect(errors).toBe(1);
  });
  it('normalizes Discord display names and initials without changing the account', () => {
    const account = Object.freeze({ ...user, globalName: '𝑶𝒛𝒂𝒓𝒖' });
    const html = renderToString(
      <AuthControlsView state={{ status: 'authenticated', user: account }} {...callbacks} />
    );
    expect(html).toContain('>Ozaru</span>');
    expect(html).toContain('>OZ</span>');
    expect(html).not.toContain(account.globalName);
    expect(account.globalName).toBe('𝑶𝒛𝒂𝒓𝒖');
  });
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
