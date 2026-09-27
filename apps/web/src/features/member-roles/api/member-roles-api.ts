import type { ChangeMemberRole, MemberRolesPage, RoleMember } from '@rcl/contracts';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/member-roles${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'La sesión ha caducado. Vuelve a iniciar sesión.',
      403: 'Solo un owner puede modificar los roles.',
      404: 'El miembro ya no existe.',
      422: 'El cambio de rol no es válido.'
    };
    const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    if (code === 'LAST_OWNER')
      throw new Error('No puedes quitar el rol al último owner. Asigna otro primero.');
    if (response.status === 409)
      throw new Error('El rol ha cambiado. Actualiza la lista antes de volver a guardarlo.');
    throw new Error(
      messages[response.status] ?? 'No se pudo completar la operación. Inténtalo de nuevo.'
    );
  }
  if (typeof body !== 'object' || body === null || !('data' in body))
    throw new Error('La respuesta de miembros no es válida.');
  return body.data as T;
}
export function getRoleMembers(search: string, offset: number, signal: AbortSignal) {
  return request<MemberRolesPage>(`?${new URLSearchParams({ search, offset: String(offset) })}`, {
    signal
  });
}
export function changeMemberRole(memberId: string, change: ChangeMemberRole) {
  return request<RoleMember>(`/${encodeURIComponent(memberId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change)
  });
}
