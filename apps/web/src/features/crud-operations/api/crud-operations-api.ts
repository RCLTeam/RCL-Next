import type {
  CrudDeleteDependency,
  CrudDeletePreview,
  CrudPageResult,
  CrudRecord,
  CrudResource
} from '@rcl/contracts';

export class CrudDependenciesError extends Error {
  constructor(public readonly dependencies: CrudDeleteDependency[]) {
    super(
      'Existen entidades relacionadas que impiden esta operación. Elimina o reasigna esas referencias antes de intentarlo de nuevo.'
    );
  }
}

async function crudRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/crud-operations/${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error('La sesión ha caducado. Vuelve a iniciar sesión.');
    if (response.status === 403) throw new Error('No tienes permiso para realizar esta operación.');
    if (body.error?.code === 'RELATED_RECORDS' && Array.isArray(body.error?.details?.dependencies))
      throw new CrudDependenciesError(body.error.details.dependencies as CrudDeleteDependency[]);
    if (body.error?.code === 'DELETE_PREVIEW_CHANGED')
      throw new Error(
        'Los datos afectados han cambiado. Cancela y vuelve a revisar la eliminación.'
      );
    const details = body.error?.details?.fieldErrors as Record<string, string[]> | undefined;
    const fields = details ? Object.keys(details).join(', ') : '';
    throw new Error(
      `${body.error?.message ?? 'No se pudo completar la operación.'}${fields ? ` (${fields})` : ''}`
    );
  }
  return body.data as T;
}
export const getCrudResources = (signal: AbortSignal) =>
  crudRequest<CrudResource[]>('resources', { signal });
export const getCrudRecords = (
  resource: string,
  search: string,
  offset: number,
  signal: AbortSignal
) =>
  crudRequest<CrudPageResult>(
    `${resource}?${new URLSearchParams({ search, offset: String(offset) })}`,
    { signal }
  );
export function saveCrudRecord(
  resource: CrudResource,
  values: CrudRecord,
  record: CrudRecord | null
) {
  return crudRequest<CrudRecord>(resource.name, {
    method: record ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      record ? { key: recordKey(resource, record), version: record.updatedAt, values } : values
    )
  });
}
export function previewCrudDelete(resource: CrudResource, record: CrudRecord, signal: AbortSignal) {
  return crudRequest<CrudDeletePreview>(`${resource.name}/delete-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ key: recordKey(resource, record), version: record.updatedAt })
  });
}
export function deleteCrudRecord(
  resource: CrudResource,
  record: CrudRecord,
  cascadeConfirmation?: string
) {
  return crudRequest<void>(resource.name, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: recordKey(resource, record),
      version: record.updatedAt,
      cascadeConfirmation
    })
  });
}
export const recordKey = (resource: CrudResource, record: CrudRecord): CrudRecord =>
  Object.fromEntries(resource.keys.map((key) => [key, record[key] ?? null]));
export function recordLabel(record: CrudRecord): string {
  if (record.seasonName) return `${record.seasonName} · ${record.divisionName}`;
  if (record.gameName) return `${record.gameName}${record.riotTag ? `#${record.riotTag}` : ''}`;
  if (record.username) return `${record.username} · ${record.discordId}`;
  if (record.name) return String(record.name);
  if (typeof record.id === 'number') return `Jornada ${record.id} · ${record.stage}`;
  return String(record.id ?? record.teamId ?? 'Registro');
}
