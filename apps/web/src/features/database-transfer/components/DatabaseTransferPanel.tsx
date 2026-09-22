import type { DatabaseImportPreview } from '@rcl/contracts';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/components/AuthProvider.js';
import {
  exportDatabase,
  importDatabase,
  previewDatabaseImport
} from '../api/database-transfer-api.js';
import './database-transfer.css';

export function DatabaseTransferPanel() {
  const { state } = useAuth();
  const owner = state.status === 'authenticated' && state.user.role === 'owner';
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DatabaseImportPreview | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [completed, setCompleted] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const validation = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      validation.current?.abort();
    };
  }, []);
  async function run(label: string, action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      if (mounted.current)
        setError(error instanceof Error ? error.message : 'No se pudo completar la operación.');
    } finally {
      running.current = false;
      if (mounted.current) setBusy('');
    }
  }
  async function download() {
    const blob = await exportDatabase();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rcl-${new Date().toISOString().replaceAll(':', '-')}.dump`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (mounted.current)
      setNotice('Exportación completada. Se ha iniciado la descarga del backup .dump.');
  }
  async function validate() {
    if (!file || !owner) return;
    validation.current = new AbortController();
    const result = await previewDatabaseImport(file, validation.current.signal);
    if (mounted.current) setPreview(result);
  }
  async function restore() {
    if (!file || !preview || !owner) return;
    try {
      await importDatabase(file, preview.confirmation);
      if (mounted.current) {
        setPreview(null);
        setFile(null);
        setCompleted(true);
      }
    } catch (error) {
      if (mounted.current) setPreview(null);
      throw error;
    }
  }
  if (completed)
    return (
      <section className="database-transfer" aria-label="Base de datos">
        <h2>Importación completada</h2>
        <p>
          Los datos se han restaurado y las sesiones se han cerrado. Tu cuenta conserva el rol
          owner.
        </p>
        <a className="btn-primary" href="/api/v1/auth/discord">
          Volver a iniciar sesión con Discord
        </a>
      </section>
    );
  return (
    <section className="database-transfer" aria-label="Importar y exportar base de datos">
      <h2>Base de datos</h2>
      <p>
        Exporta una copia PostgreSQL o restaura los datos desde un backup compatible con el esquema
        actual de RCL.
      </p>
      {error && (
        <p className="database-transfer-error" role="alert">
          {error}
        </p>
      )}
      {notice && <output className="database-transfer-success">{notice}</output>}
      <div className="database-transfer-panels">
        <section>
          <h3>Exportar base de datos</h3>
          <p>
            Descarga un archivo nativo .dump con el esquema y los datos de la aplicación, incluidos
            miembros, roles e historial. Disponible para admin y owner.
          </p>
          <button
            className="btn-primary"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void run('Exportando…', download)}
          >
            Exportar .dump
          </button>
        </section>
        <section>
          <h3>Importar base de datos</h3>
          {owner ? (
            <>
              <p>
                La importación reemplaza los datos actuales. Exporta una copia antes de continuar.
                Se conserva tu cuenta owner y se cierran todas las sesiones.
              </p>
              <label htmlFor="database-backup">Backup PostgreSQL (.dump, máximo 64 MiB)</label>
              <input
                id="database-backup"
                type="file"
                accept=".dump"
                disabled={Boolean(busy)}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setPreview(null);
                  setError('');
                  setNotice('');
                  if (
                    selected &&
                    (!selected.name.toLowerCase().endsWith('.dump') ||
                      selected.size > 64 * 1024 * 1024 ||
                      selected.size === 0)
                  ) {
                    setFile(null);
                    setError('Selecciona un archivo .dump no vacío de hasta 64 MiB.');
                    event.target.value = '';
                  } else setFile(selected);
                }}
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={!file || Boolean(busy)}
                onClick={() => void run('Validando backup…', validate)}
              >
                Validar y revisar importación
              </button>
            </>
          ) : (
            <p>
              Solo un owner puede importar una base de datos. Puedes utilizar la exportación para
              descargar una copia.
            </p>
          )}
        </section>
      </div>
      {busy && <output>{busy} No cierres esta página hasta que termine.</output>}
      {owner && preview && (
        <DatabaseImportDialog
          preview={preview}
          filename={file?.name ?? ''}
          busy={Boolean(busy)}
          onCancel={() => setPreview(null)}
          onConfirm={() => void run('Importando…', restore)}
        />
      )}
    </section>
  );
}

export function DatabaseImportDialog({
  preview,
  filename,
  busy,
  onCancel,
  onConfirm
}: {
  preview: DatabaseImportPreview;
  filename: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="database-import-dialog"
      aria-labelledby="database-import-title"
      aria-describedby="database-import-warning"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h3 id="database-import-title">Confirmar importación</h3>
      <p>{filename}</p>
      {preview.exportedAt && <p>Fecha del backup: {preview.exportedAt}</p>}
      <p id="database-import-warning">
        Se reemplazarán los datos de todas las tablas indicadas. Esta acción no se puede deshacer
        desde la web. El esquema se conserva; se cerrarán las sesiones y tu cuenta mantendrá el rol
        owner.
      </p>
      <div className="database-import-table">
        <table>
          <caption>Datos actuales y contenido del archivo</caption>
          <thead>
            <tr>
              <th scope="col">Tabla</th>
              <th scope="col">Filas actuales</th>
              <th scope="col">Filas en el backup</th>
            </tr>
          </thead>
          <tbody>
            {preview.tables.map((table) => (
              <tr key={table.table}>
                <td>{table.table}</td>
                <td>{table.currentRows}</td>
                <td>{table.importedRows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label htmlFor="database-import-confirmation">
        Escribe IMPORTAR para confirmar el reemplazo
      </label>
      <input
        id="database-import-confirmation"
        autoComplete="off"
        value={confirmation}
        disabled={busy}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      <div className="database-transfer-actions">
        <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || confirmation !== 'IMPORTAR'}
          onClick={onConfirm}
        >
          {busy ? 'Importando…' : 'Confirmar importación'}
        </button>
      </div>
    </dialog>
  );
}
