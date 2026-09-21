import type { CrudPageResult, CrudRecord, CrudResource } from '@rcl/contracts';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/components/AuthProvider.js';
import {
  getCrudRecords,
  recordKey,
  recordLabel,
  saveCrudRecord
} from '../api/crud-operations-api.js';
import { CrudDeleteDialog } from './CrudDeleteDialog.js';
import { CrudRecordForm } from './CrudRecordForm.js';
import './crud-operations.css';

export function CrudDataPanel({ resource }: { resource: CrudResource }) {
  const { state } = useAuth();
  const owner = state.status === 'authenticated' && state.user.role === 'owner';
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<CrudPageResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ record: CrudRecord | null } | null>(null);
  const [deleting, setDeleting] = useState<CrudRecord | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Revision reloads after mutations and manual refresh.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError('');
    const timer = window.setTimeout(() => {
      getCrudRecords(resource.name, search, offset, controller.signal)
        .then(setData)
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setError(
              error instanceof Error ? error.message : 'No se pudieron cargar los registros.'
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [resource.name, search, offset, revision]);
  useEffect(() => {
    if (editor) editorRef.current?.focus();
  }, [editor]);
  async function mutate(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (!mounted.current) return;
      setEditor(null);
      setDeleting(null);
      setNotice(message);
      setRevision((value) => value + 1);
      if (deleting && data?.records.length === 1 && offset) setOffset(offset - 50);
    } catch (error) {
      if (mounted.current)
        setError(error instanceof Error ? error.message : 'No se pudo guardar el cambio.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const columns = resource.fields.slice(0, 5);
  return (
    <section className="crud-operations-data" aria-label={resource.label}>
      {deleting && (
        <CrudDeleteDialog
          resource={resource}
          record={deleting}
          owner={owner}
          onCancel={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setNotice('Registro y datos confirmados eliminados.');
            setRevision((value) => value + 1);
            if (data?.records.length === 1 && offset) setOffset(offset - 50);
          }}
        />
      )}
      <div className="crud-operations-data-heading">
        <div>
          <h2>{resource.label}</h2>
          <p>{resource.description}</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || Boolean(editor) || Boolean(deleting)}
          onClick={() => {
            setEditor({ record: null });
            setNotice('');
          }}
        >
          Nuevo registro
        </button>
      </div>
      {notice && <output className="crud-operations-success">{notice}</output>}
      {error && (
        <div role="alert" className="crud-operations-error">
          <p>{error}</p>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => {
              setEditor(null);
              setDeleting(null);
              setRevision((value) => value + 1);
            }}
          >
            Recargar datos
          </button>
        </div>
      )}
      {editor && (
        <div ref={editorRef} tabIndex={-1}>
          {editor && (
            <CrudRecordForm
              key={JSON.stringify(editor.record)}
              resource={resource}
              record={editor.record}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={(values) =>
                void mutate(
                  () => saveCrudRecord(resource, values, editor.record),
                  'Registro guardado.'
                )
              }
            />
          )}
        </div>
      )}
      <div className="crud-operations-toolbar">
        <label>
          Buscar registros
          <input
            type="search"
            placeholder="Nombre, identificador…"
            value={search}
            maxLength={120}
            disabled={busy}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
        </label>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          Actualizar
        </button>
      </div>
      {loading ? (
        <output>Cargando registros…</output>
      ) : (
        data && (
          <>
            {data.records.length === 0 ? (
              <p className="empty-state">
                {search
                  ? 'No hay registros que coincidan con la búsqueda.'
                  : 'Todavía no hay registros.'}
              </p>
            ) : (
              <div className="crud-operations-table-scroll">
                <table>
                  <caption className="sr-only">Registros de {resource.label}</caption>
                  <thead>
                    <tr>
                      {columns.map((field) => (
                        <th key={field.name} scope="col">
                          {field.label}
                        </th>
                      ))}
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records.map((record) => (
                      <tr key={JSON.stringify(recordKey(resource, record))}>
                        {columns.map((field) => (
                          <td key={field.name}>
                            {typeof record[field.name] === 'boolean'
                              ? record[field.name]
                                ? 'Sí'
                                : 'No'
                              : String(record[`${field.name}Label`] ?? record[field.name] ?? '—')}
                          </td>
                        ))}
                        <td>
                          <div className="crud-operations-actions">
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={busy || Boolean(editor) || Boolean(deleting)}
                              aria-label={`Editar ${recordLabel(record)}`}
                              onClick={() => {
                                setEditor({ record });
                                setNotice('');
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={busy || Boolean(editor) || Boolean(deleting)}
                              aria-label={`Eliminar ${recordLabel(record)}`}
                              onClick={() => {
                                setDeleting(record);
                                setNotice('');
                              }}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="crud-operations-pagination">
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || offset === 0}
                onClick={() => setOffset(offset - 50)}
              >
                Anterior
              </button>
              <span>
                Página {offset / 50 + 1} · {data.records.length} registros
              </span>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || !data.hasMore}
                onClick={() => setOffset(offset + 50)}
              >
                Siguiente
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
