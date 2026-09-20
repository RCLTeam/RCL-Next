import type { CrudResource } from '@rcl/contracts';
import React, { useEffect, useState } from 'react';
import { getCrudResources } from '../api/crud-operations-api.js';
import { CrudDataPanel } from './CrudDataPanel.js';

export function CrudOperationsPanel() {
  const [resources, setResources] = useState<CrudResource[]>([]);
  const [selected, setSelected] = useState('seasons');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly reloads the catalog.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getCrudResources(controller.signal)
      .then(setResources)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : 'No se pudo cargar la administración.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  const resource = resources.find((resource) => resource.name === selected);
  if (loading) return <output>Cargando administración…</output>;
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button className="btn-ghost" type="button" onClick={() => setRetry(retry + 1)}>
          Reintentar
        </button>
      </div>
    );
  return (
    <div className="crud-operations-crud">
      <div className="crud-operations-resource-selector">
        <label htmlFor="crud-operations-resource">Datos que quieres gestionar</label>
        <select
          id="crud-operations-resource"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {resources.map((resource) => (
            <option key={resource.name} value={resource.name}>
              {resource.label}
            </option>
          ))}
        </select>
      </div>
      {resource && <CrudDataPanel key={resource.name} resource={resource} />}
    </div>
  );
}
