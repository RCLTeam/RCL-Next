import type { DatabaseImportPreview, DatabaseImportResult } from '@rcl/contracts';

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`/api/v1/database-transfer/${path}`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    ...init
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const messages: Record<string, string> = {
      IMPORT_PREVIEW_CHANGED:
        'El archivo o la base de datos han cambiado. Vuelve a validar antes de importar.',
      DATABASE_BUSY: 'Hay otra operacion en curso. Intentalo de nuevo en unos instantes.',
      POSTGRES_TOOLS_UNAVAILABLE:
        'No estan disponibles pg_dump y pg_restore. Revisa POSTGRES_BIN_DIR en la API.',
      INCOMPATIBLE_BACKUP: 'El backup no corresponde al esquema actual de RCL o esta incompleto.',
      INVALID_BACKUP: 'Selecciona un backup PostgreSQL valido en formato .dump.',
      INVALID_BACKUP_DATA:
        'El backup contiene datos incompatibles. La base actual se ha conservado.'
    };
    throw new Error(
      messages[String(body?.error?.code)] ??
        (response.status === 401
          ? 'La sesion ha caducado. Vuelve a iniciar sesion.'
          : response.status === 403
            ? 'No tienes permiso para realizar esta operacion.'
            : response.status === 413
              ? 'El archivo supera el limite permitido para transferencias web.'
              : 'No se pudo completar la operacion. Comprueba la conexion y la configuracion de PostgreSQL.')
    );
  }
  return response;
}
export async function exportDatabase(): Promise<Blob> {
  return (await request('export')).blob();
}
export async function previewDatabaseImport(
  file: File,
  signal: AbortSignal
): Promise<DatabaseImportPreview> {
  const response = await request('import-preview', {
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
    signal
  });
  return (await response.json()).data as DatabaseImportPreview;
}
export async function importDatabase(
  file: File,
  confirmation: string
): Promise<DatabaseImportResult> {
  const response = await request('import', {
    body: file,
    headers: { 'Content-Type': 'application/octet-stream', 'X-Import-Confirmation': confirmation }
  });
  return (await response.json()).data as DatabaseImportResult;
}
