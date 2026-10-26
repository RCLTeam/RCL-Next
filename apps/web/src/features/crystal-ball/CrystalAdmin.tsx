import type { CrystalAnswers, CrystalBallData } from '@rcl/contracts';
import React, { useState } from 'react';
import { useEditorLeaveGuard } from '../home-content/useEditorLeaveGuard.js';
import { CrystalFields } from './CrystalFields.js';

function localDate(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function CrystalAdmin({
  data,
  configure,
  resolve,
  onDirty,
  onBusy
}: {
  data: CrystalBallData;
  configure: (open: string, close: string) => Promise<void>;
  resolve: (answers: CrystalAnswers, finalize: boolean) => Promise<void>;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [opensAt, setOpen] = useState(localDate(data.opensAt));
  const [closesAt, setClose] = useState(localDate(data.closesAt));
  const manual = data.questions.filter((q) => q.mode === 'manual');
  const [answers, setAnswers] = useState<CrystalAnswers>(() =>
    Object.fromEntries(
      Object.entries(data.results).filter(([id]) => manual.some((q) => q.id === id))
    )
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [datesDirty, setDatesDirty] = useState(false);
  const [resultsDirty, setResultsDirty] = useState(false);
  const [tab, setTab] = useState<'window' | 'results'>('window');
  useEditorLeaveGuard(datesDirty || resultsDirty, busy);
  const closed = ['closed', 'resolved'].includes(data.status);
  async function perform(action: () => Promise<void>, kind: 'window' | 'results') {
    setBusy(true);
    onBusy(true);
    setMessage('');
    try {
      await action();
      setMessage('Cambios publicados.');
      if (kind === 'window') {
        setDatesDirty(false);
        onDirty(resultsDirty);
      } else {
        setResultsDirty(false);
        onDirty(datesDirty);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="crystal-admin" aria-label="Gestionar bola de cristal">
      <nav className="crystal-divisions" aria-label="Gestión de campaña">
        <button type="button" aria-pressed={tab === 'window'} onClick={() => setTab('window')}>
          Apertura y cierre
        </button>
        <button type="button" aria-pressed={tab === 'results'} onClick={() => setTab('results')}>
          Resultados · {Object.keys(data.results).length}/{data.questions.length}
        </button>
      </nav>
      <div hidden={tab !== 'window'}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(
              () => configure(new Date(opensAt).toISOString(), new Date(closesAt).toISOString()),
              'window'
            );
          }}
        >
          <h2>Apertura y cierre</h2>
          <p>
            Fechas en tu zona horaria ({Intl.DateTimeFormat().resolvedOptions().timeZone}). El
            cierre no puede superar el inicio de playoffs. Una votación cerrada no se puede reabrir.
          </p>
          <div className="crystal-window">
            <label>
              Apertura
              <input
                type="datetime-local"
                required
                value={opensAt}
                disabled={busy || closed}
                onChange={(e) => {
                  setOpen(e.target.value);
                  setDatesDirty(true);
                  onDirty(true);
                }}
              />
            </label>
            <label>
              Cierre
              <input
                type="datetime-local"
                required
                value={closesAt}
                disabled={busy || closed}
                onChange={(e) => {
                  setClose(e.target.value);
                  setDatesDirty(true);
                  onDirty(true);
                }}
              />
            </label>
          </div>
          <button type="submit" disabled={busy || closed}>
            Guardar fechas
          </button>
        </form>
      </div>
      <div hidden={tab !== 'results'}>
        <h2>Resolver predicciones</h2>
        <p>
          Publica los clasificados y los premios manuales después del cierre. Deja sin seleccionar
          las preguntas pendientes. Para corregir un resultado, modifica la selección y vuelve a
          publicar.
        </p>
        <CrystalFields
          questions={manual}
          answers={answers}
          onChange={(next) => {
            setAnswers(next);
            setResultsDirty(true);
            onDirty(true);
          }}
          disabled={busy || !closed}
          manual
        />
        <div className="crystal-actions">
          <button
            type="button"
            disabled={busy || !closed}
            onClick={() => void perform(() => resolve(answers, false), 'results')}
          >
            Publicar resultados manuales
          </button>
          <button
            type="button"
            disabled={busy || !closed}
            onClick={() => void perform(() => resolve(answers, true), 'results')}
          >
            Calcular resultados automáticos
          </button>
        </div>
        <p>
          Calcula las estadísticas cuando todas las series hayan terminado y todos los mapas estén
          importados. Los empates aceptan cualquiera de los ganadores. Las preguntas sin datos
          suficientes quedan pendientes.
        </p>
      </div>
      <output>{busy ? 'Guardando…' : message}</output>
    </section>
  );
}
