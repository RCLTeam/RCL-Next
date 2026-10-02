import type { AdminMatchMap } from '@rcl/contracts';
import React, { useEffect, useState } from 'react';
import { getMatchMaps, saveMatchMapOrder } from '../api/crud-operations-api.js';

export function MatchMapOrderEditor({
  matchId,
  busy,
  onBusy
}: {
  matchId: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [maps, setMaps] = useState<AdminMatchMap[] | null>(null);
  const [expectedOrder, setExpectedOrder] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // biome-ignore lint/correctness/useExhaustiveDependencies: Manual reload refreshes the saved order.
  useEffect(() => {
    const controller = new AbortController();
    setMaps(null);
    setError('');
    setNotice('');
    getMatchMaps(matchId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setMaps(data);
        setExpectedOrder(data.map((map) => map.id));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : 'No se pudieron cargar los mapas.');
      });
    return () => controller.abort();
  }, [matchId, revision]);

  function move(index: number, direction: number) {
    if (!maps || busy) return;
    const next = [...maps];
    const [map] = next.splice(index, 1);
    if (!map) return;
    next.splice(index + direction, 0, map);
    setMaps(next);
    setNotice('');
  }
  async function save() {
    if (!maps || busy) return;
    onBusy(true);
    setError('');
    setNotice('');
    const gameIds = maps.map((map) => map.id);
    try {
      await saveMatchMapOrder(matchId, { expectedOrder, gameIds });
      setExpectedOrder(gameIds);
      setNotice('Orden de los mapas guardado.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar el orden.');
    } finally {
      onBusy(false);
    }
  }
  const dirty = maps?.some((map, index) => map.id !== expectedOrder[index]);
  return (
    <section className="crud-map-order" aria-label="Orden de los mapas">
      <h3>Orden de los mapas</h3>
      <p>
        Mueve las partidas al orden correcto y guarda los cambios. No necesitas volver a subir los
        ROFL.
      </p>
      {error && (
        <p role="alert" className="crud-operations-error">
          {error}
        </p>
      )}
      {notice && <output className="crud-operations-success">{notice}</output>}
      {!maps && !error && <output>Cargando mapas…</output>}
      {maps?.length === 0 && <p>Este encuentro todavía no tiene mapas importados.</p>}
      <ol>
        {maps?.map((map, index) => (
          <li key={map.id}>
            <div>
              <strong>
                Mapa {index + 1} · {map.externalGameId ?? map.id}
              </strong>
              <p>
                Ganador: {map.winner ?? 'Sin resultado'}
                {map.durationSeconds
                  ? ` · ${Math.floor(map.durationSeconds / 60)}:${String(map.durationSeconds % 60).padStart(2, '0')}`
                  : ''}
              </p>
            </div>
            <div className="crud-operations-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || index === 0}
                aria-label={`Subir mapa ${index + 1}`}
                onClick={() => move(index, -1)}
              >
                ↑ Subir
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || index === maps.length - 1}
                aria-label={`Bajar mapa ${index + 1}`}
                onClick={() => move(index, 1)}
              >
                ↓ Bajar
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="crud-operations-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          Guardar orden
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          Recargar orden
        </button>
      </div>
    </section>
  );
}
