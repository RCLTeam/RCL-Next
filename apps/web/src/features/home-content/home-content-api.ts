import type { EditorialArticle, EditorialInput, WeeklyTeam, WeeklyTeamInput } from '@rcl/contracts';

export async function contentRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/home-content/${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'La sesion ha caducado. Inicia sesion de nuevo.',
      403: 'No tienes permiso para realizar esta operacion.',
      404: 'El contenido no esta disponible.',
      413: 'La imagen supera el limite de 5 MB.',
      422: 'Revisa los campos y el formato de las imagenes.'
    };
    throw new Error(
      messages[response.status] ?? 'No se pudo cargar o guardar el contenido. Intentalo de nuevo.'
    );
  }
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('data' in body))
    throw new Error('Respuesta no valida.');
  return body.data as T;
}
const json = (method: string, body: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});
export const saveArticle = (
  id: string | null,
  input: EditorialInput,
  uploadedImages: string[] = []
) =>
  contentRequest<EditorialArticle>(
    `admin/articles${id ? `/${id}` : ''}`,
    json(id ? 'PUT' : 'POST', { ...input, uploadedImages })
  );
export const deleteArticle = (id: string) =>
  contentRequest<null>(`admin/articles/${id}`, { method: 'DELETE' });
export const discardImages = (urls: string[]) =>
  contentRequest<null>('admin/images/discard', {
    ...json('POST', { urls }),
    keepalive: true
  });
export const saveWeeklyTeam = (id: string, input: WeeklyTeamInput) =>
  contentRequest<WeeklyTeam>(`admin/weekly-teams/${id}`, json('PUT', input));
