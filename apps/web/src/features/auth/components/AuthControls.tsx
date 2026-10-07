import type { AuthUser } from '@rcl/contracts';
import React, { useState } from 'react';
import { discordAvatarUrl } from '../../../shared/discord-avatar-url.js';
import { displayName } from '../../../shared/display-name.js';
import { discordLoginUrl } from '../api/auth-api.js';
import { type AuthState, useAuth } from './AuthProvider.js';
import './auth.css';

interface AuthControlsViewProps {
  state: AuthState;
  signingOut?: boolean;
  logoutError?: boolean;
  onRetry: () => void;
  onLogout: () => void;
}

interface AccountAvatarViewProps {
  user: AuthUser;
  failed: boolean;
  onError: () => void;
}

export function AccountAvatarView({ user, failed, onError }: AccountAvatarViewProps) {
  const name = displayName(user.globalName || user.username);
  if (user.avatarHash && !failed)
    return (
      <img
        className="auth-avatar"
        src={discordAvatarUrl(user.discordId, user.avatarHash)}
        alt={name}
        onError={onError}
      />
    );
  return (
    <span className="auth-avatar" aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function AccountAvatar({ user }: { user: AuthUser }) {
  // Keyed by URL so a new avatar hash gets a fresh download attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = user.avatarHash ? discordAvatarUrl(user.discordId, user.avatarHash) : null;
  return (
    <AccountAvatarView
      user={user}
      failed={url !== null && failedUrl === url}
      onError={() => setFailedUrl(url)}
    />
  );
}

export function AuthControlsView({
  state,
  signingOut = false,
  logoutError = false,
  onRetry,
  onLogout
}: AuthControlsViewProps) {
  return (
    <section
      className="auth-controls"
      aria-label="Cuenta de Discord"
      aria-busy={state.status === 'loading' || signingOut}
    >
      {state.status === 'loading' && <output className="auth-hint">Comprobando sesión…</output>}
      {state.status === 'anonymous' && (
        <a className="auth-button auth-login" href={discordLoginUrl}>
          Entrar con Discord <span aria-hidden="true">↗</span>
        </a>
      )}
      {state.status === 'authenticated' && (
        <>
          <div className="auth-identity">
            <AccountAvatar user={state.user} />
            <div className="auth-user">
              <span className="auth-name">
                {displayName(state.user.globalName || state.user.username)}
              </span>
              <span className="auth-hint">
                {state.user.role === 'owner'
                  ? 'Owner'
                  : state.user.role === 'admin'
                    ? 'Administrador'
                    : 'Miembro'}
              </span>
            </div>
          </div>
          <button
            className="auth-button auth-logout"
            type="button"
            onClick={onLogout}
            disabled={signingOut}
          >
            {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
          {logoutError && (
            <span className="auth-error" role="alert">
              No se pudo cerrar la sesión. Vuelve a intentarlo.
            </span>
          )}
        </>
      )}
      {state.status === 'error' && (
        <>
          <span className="auth-error" role="alert">
            No se pudo comprobar tu sesión.
          </span>
          <button className="auth-button auth-logout" type="button" onClick={onRetry}>
            Reintentar
          </button>
        </>
      )}
    </section>
  );
}

export function AuthControls() {
  const { state, signingOut, logoutError, retry, logout } = useAuth();

  return (
    <AuthControlsView
      state={state}
      signingOut={signingOut}
      logoutError={logoutError}
      onRetry={retry}
      onLogout={() => {
        void logout();
      }}
    />
  );
}
