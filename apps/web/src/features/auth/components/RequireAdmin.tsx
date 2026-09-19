import React, { type ReactNode } from 'react';
import { discordLoginUrl } from '../api/auth-api.js';
import { canAccessAdmin, useAuth } from './AuthProvider.js';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { state, retry, signingOut } = useAuth();
  if (state.status === 'loading' || signingOut)
    return <output className="empty-state">Comprobando acceso…</output>;
  if (state.status === 'error')
    return (
      <div className="empty-state error-state" role="alert">
        <p>No se pudo comprobar tu sesión.</p>
        <button type="button" className="btn-ghost" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  if (state.status === 'anonymous')
    return (
      <div className="empty-state">
        <p>Inicia sesión para acceder a la administración.</p>
        <a className="btn-primary" href={discordLoginUrl}>
          Entrar con Discord
        </a>
      </div>
    );
  if (!canAccessAdmin(state))
    return (
      <p className="empty-state error-state" role="alert">
        No tienes permisos de administración.
      </p>
    );
  return <>{children}</>;
}
