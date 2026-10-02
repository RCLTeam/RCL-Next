export type Logo = { name: string; url: string };

async function logoRequest<T>(path = '', init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/team-logos/admin${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Inicia sesión de nuevo.',
      403: 'No tienes permisos para gestionar logos.',
      404: 'El logo ya no existe. Actualiza la lista.',
      409: 'Ya existe un logo con ese nombre.',
      413: 'La imagen supera los 5 MB.',
      422: 'Usa una imagen PNG, JPEG o WebP y un nombre con letras, números o guiones.'
    };
    throw new Error(
      messages[response.status] ?? 'No se pudo completar la operación. Inténtalo de nuevo.'
    );
  }
  return (await response.json()).data as T;
}

export const teamLogosApi = {
  list: () => logoRequest<Logo[]>(),
  upload: (file: File) =>
    logoRequest<Logo>(`/${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file
    }),
  remove: (name: string) => logoRequest<null>(`/${encodeURIComponent(name)}`, { method: 'DELETE' })
};
