import type { AuthUser } from '@rcl/contracts';
import React, { useEffect, useState } from 'react';
import { discordLoginUrl, endSession, getSession } from './auth-api.js';
import './auth.css';

export type AuthState =
  | { status: 'loading' | 'anonymous' | 'error' }
  | { status: 'authenticated'; user: AuthUser };

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
            <span className="auth-avatar" aria-hidden="true">
              {(state.user.globalName || state.user.username).slice(0, 2).toUpperCase()}
            </span>
            <div className="auth-user">
              <span className="auth-name">{state.user.globalName || state.user.username}</span>
              <span className="auth-hint">
                {state.user.role === 'admin' ? 'Administrador' : 'Miembro'}
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
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry deliberately starts a fresh cancellable request.
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getSession(controller.signal)
      .then((user) => {
        if (!controller.signal.aborted)
          setState(user ? { status: 'authenticated', user } : { status: 'anonymous' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [attempt]);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError(false);
    try {
      await endSession();
      setState({ status: 'anonymous' });
    } catch {
      // Keep the user visible until the server has confirmed revocation.
      setLogoutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <AuthControlsView
      state={state}
      signingOut={signingOut}
      logoutError={logoutError}
      onRetry={() => setAttempt((value) => value + 1)}
      onLogout={() => {
        void logout();
      }}
    />
  );
}
