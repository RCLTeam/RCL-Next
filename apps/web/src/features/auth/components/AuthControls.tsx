import React from 'react';
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
            {state.user.avatarHash ? (
              <img
                className="auth-avatar"
                src={`https://cdn.discordapp.com/avatars/${state.user.discordId}/${state.user.avatarHash}.${
                  state.user.avatarHash.startsWith('a_') ? 'gif' : 'png'
                }`}
                alt={state.user.globalName || state.user.username}
              />
            ) : (
              <span className="auth-avatar" aria-hidden="true">
                {(state.user.globalName || state.user.username).slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="auth-user">
              <span className="auth-name">{state.user.globalName || state.user.username}</span>
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
