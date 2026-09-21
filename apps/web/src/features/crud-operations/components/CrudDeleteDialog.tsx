import type { CrudDeletePreview, CrudRecord, CrudResource } from '@rcl/contracts';
import React, { useEffect, useRef, useState } from 'react';
import { deleteCrudRecord, previewCrudDelete, recordLabel } from '../api/crud-operations-api.js';

export function CrudDeleteDialog({
  resource,
  record,
  owner,
  onDeleted,
  onCancel
}: {
  resource: CrudResource;
  record: CrudRecord;
  owner: boolean;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<CrudDeletePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setError('');
    setConfirmed(false);
    if (owner)
      previewCrudDelete(resource, record, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setPreview(value);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setError(
              error instanceof Error ? error.message : 'No se pudo calcular la eliminación.'
            );
        });
    return () => controller.abort();
  }, [owner, record, resource]);
  async function remove() {
    if (pending.current || (owner && (!preview?.allowed || !confirmed))) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await deleteCrudRecord(resource, record, owner ? preview?.confirmation : undefined);
      if (mounted.current) onDeleted();
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : 'No se pudo eliminar.');
        setConfirmed(false);
        if (owner) setPreview(null);
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="crud-operations-delete-dialog"
      aria-labelledby="crud-delete-title"
      aria-describedby="crud-delete-warning"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) onCancel();
      }}
    >
      <h3 id="crud-delete-title">Eliminar {recordLabel(record)}</h3>
      <p id="crud-delete-warning">
        Esta acción es irreversible.{' '}
        {owner
          ? 'Se eliminarán el registro y los datos vinculados por relaciones en cascada.'
          : 'Si tiene datos relacionados, la eliminación se bloqueará. Solo un owner puede borrar en cascada.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {owner && !preview && !error && <output>Calculando filas afectadas…</output>}
      {owner && preview && (
        <>
          <CrudDeleteImpactTable preview={preview} />
          {!preview.allowed ? (
            <p role="alert">
              Existen referencias protegidas que impiden eliminar. Reasígnalas antes de continuar.
            </p>
          ) : (
            <label className="crud-operations-delete-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              He revisado las tablas y filas afectadas y confirmo su eliminación definitiva.
            </label>
          )}
        </>
      )}
      <div className="crud-operations-actions">
        <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-primary crud-operations-danger"
          disabled={busy || (owner && (!preview?.allowed || !confirmed))}
          onClick={() => void remove()}
        >
          {busy
            ? 'Eliminando…'
            : owner
              ? 'Confirmar eliminación en cascada'
              : 'Confirmar eliminación'}
        </button>
      </div>
    </dialog>
  );
}

export function CrudDeleteImpactTable({ preview }: { preview: CrudDeletePreview }) {
  return (
    <div className="crud-operations-table-scroll">
      <table>
        <caption>
          Alcance de la eliminación ·{' '}
          {preview.impacts
            .filter((impact) => impact.action === 'delete')
            .reduce((sum, impact) => sum + impact.count, 0)}{' '}
          filas que se eliminarán
        </caption>
        <thead>
          <tr>
            <th scope="col">Tabla</th>
            <th scope="col">Efecto</th>
            <th scope="col">Filas</th>
            <th scope="col">Identificadores (hasta 5 ejemplos)</th>
          </tr>
        </thead>
        <tbody>
          {preview.impacts.map((impact) => (
            <tr key={`${impact.table}:${impact.action}`}>
              <td>{impact.table}</td>
              <td>
                {impact.action === 'delete'
                  ? 'Eliminar'
                  : impact.action === 'set-null'
                    ? 'Desvincular (no se eliminan)'
                    : 'Bloquea el borrado'}
              </td>
              <td>{impact.count}</td>
              <td>
                {impact.examples.map((key) => (
                  <div key={JSON.stringify(key)}>
                    {Object.entries(key)
                      .map(([name, value]) => `${name}: ${value}`)
                      .join(' · ')}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
