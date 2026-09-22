import type {
  CrudDeleteDependency,
  CrudDeletePreview,
  CrudRecord,
  CrudResource
} from '@rcl/contracts';
import React, { useEffect, useRef, useState } from 'react';
import {
  CrudDependenciesError,
  deleteCrudRecord,
  previewCrudDelete,
  recordLabel
} from '../api/crud-operations-api.js';

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
  const [dependencies, setDependencies] = useState<CrudDeleteDependency[]>([]);
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
    setDependencies([]);
    setError('');
    setConfirmed(false);
    previewCrudDelete(resource, record, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setPreview(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : 'No se pudo calcular la eliminación.');
      });
    return () => controller.abort();
  }, [record, resource]);
  async function remove() {
    if (pending.current || !preview?.allowed || (owner && !confirmed)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setDependencies([]);
    try {
      await deleteCrudRecord(resource, record, owner ? preview?.confirmation : undefined);
      if (mounted.current) onDeleted();
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : 'No se pudo eliminar.');
        if (error instanceof CrudDependenciesError) setDependencies(error.dependencies);
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
          : 'Si tiene datos relacionados, la eliminación se bloqueará.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {dependencies.length > 0 && <CrudDeleteDependencies dependencies={dependencies} />}
      {!preview && !error && <output>Calculando filas afectadas…</output>}
      {preview && dependencies.length === 0 && (
        <>
          <CrudDeleteImpactTable preview={preview} />
          {!preview.allowed ? (
            <p role="alert">
              {owner
                ? 'Existen referencias protegidas que impiden eliminar. Reasígnalas antes de continuar.'
                : 'Existen datos relacionados que impiden eliminar. Solo un owner puede borrar en cascada.'}
            </p>
          ) : (
            owner && (
              <label className="crud-operations-delete-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                He revisado las tablas y filas afectadas y confirmo su eliminación definitiva.
              </label>
            )
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
          disabled={busy || !preview?.allowed || (owner && !confirmed)}
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

export function CrudDeleteDependencies({ dependencies }: { dependencies: CrudDeleteDependency[] }) {
  return (
    <CrudDeleteImpactTable
      caption="Entidades relacionadas que impiden eliminar"
      preview={{
        allowed: false,
        confirmation: '',
        impacts: dependencies.map(({ label, count }) => ({
          table: label,
          action: 'blocked',
          count,
          examples: []
        }))
      }}
    />
  );
}

export function CrudDeleteImpactTable({
  preview,
  caption
}: {
  preview: CrudDeletePreview;
  caption?: string;
}) {
  return (
    <div className="crud-operations-table-scroll">
      <table>
        <caption>
          {caption ?? (
            <>
              Alcance de la eliminación ·{' '}
              {preview.impacts
                .filter((impact) => impact.action === 'delete')
                .reduce((sum, impact) => sum + impact.count, 0)}{' '}
              filas afectadas por el borrado en cascada
            </>
          )}
        </caption>
        <thead>
          <tr>
            <th scope="col">Tabla</th>
            <th scope="col">Efecto</th>
            <th scope="col">Filas</th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
