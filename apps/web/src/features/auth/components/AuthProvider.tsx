import type { AuthUser } from '@rcl/contracts';
import React, { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { endSession, getSession } from '../api/auth-api.js';

export type AuthState =
  | { status: 'loading' | 'anonymous' | 'error' }
  | { status: 'authenticated'; user: AuthUser };

interface AuthSession {
  state: AuthState;
  signingOut: boolean;
  logoutError: boolean;
  retry: () => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthSession>({
  state: { status: 'loading' },
  signingOut: false,
  logoutError: false,
  retry: () => {},
  logout: async () => {}
});

export function useAuth() {
  return useContext(AuthContext);
}

export function canAccessAdmin(state: AuthState): boolean {
  return state.status === 'authenticated' && ['admin', 'owner'].includes(state.user.role);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry starts a fresh cancellable session request.
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
      setLogoutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        state,
        signingOut,
        logoutError,
        retry: () => setAttempt((value) => value + 1),
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
