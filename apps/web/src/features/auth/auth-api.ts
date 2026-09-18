import type { AuthUser } from '@rcl/contracts';

// The dev server proxies /api to the backend. Production must route /api likewise.
export const discordLoginUrl = '/api/v1/auth/discord';

export async function getSession(signal?: AbortSignal): Promise<AuthUser | null> {
  const response = await fetch('/api/v1/auth/me', {
    credentials: 'include',
    cache: 'no-store',
    ...(signal ? { signal } : {})
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('No se pudo comprobar la sesión. Inténtalo de nuevo.');
  const body: unknown = await response.json();
  const user = typeof body === 'object' && body !== null && 'data' in body ? body.data : null;
  if (
    typeof user !== 'object' ||
    user === null ||
    !('discordId' in user) ||
    typeof user.discordId !== 'string' ||
    !('username' in user) ||
    typeof user.username !== 'string' ||
    !('globalName' in user) ||
    (user.globalName !== null && typeof user.globalName !== 'string') ||
    !('avatarHash' in user) ||
    (user.avatarHash !== null && typeof user.avatarHash !== 'string') ||
    !('role' in user) ||
    (user.role !== 'viewer' && user.role !== 'admin')
  )
    throw new Error('La respuesta de sesión no es válida.');
  return user as AuthUser;
}

export async function endSession(): Promise<void> {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include'
  });
  if (response.status !== 204) throw new Error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
}
