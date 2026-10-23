import type { CrystalAnswers, CrystalBallData } from '@rcl/contracts';
import React, { useState } from 'react';
import { CrystalFields } from './CrystalFields.js';

function localDate(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function CrystalAdmin({
  data,
  configure,
  resolve
}: {
  data: CrystalBallData;
  configure: (open: string, close: string) => Promise<void>;
  resolve: (answers: CrystalAnswers, finalize: boolean) => Promise<void>;
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
  const closed = ['closed', 'resolved'].includes(data.status);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setMessage('Cambios publicados.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="crystal-admin">
      <summary>Administrar bola de cristal</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void perform(() =>
            configure(new Date(opensAt).toISOString(), new Date(closesAt).toISOString())
          );
        }}
      >
        <h2>Apertura y cierre</h2>
        <p>
          Fechas en tu zona horaria ({Intl.DateTimeFormat().resolvedOptions().timeZone}). El cierre
          no puede superar el inicio de playoffs. Una votación cerrada no se puede reabrir.
        </p>
        <div className="crystal-window">
          <label>
            Apertura
            <input
              type="datetime-local"
              required
              value={opensAt}
              disabled={busy || closed}
              onChange={(e) => setOpen(e.target.value)}
            />
          </label>
          <label>
            Cierre
            <input
              type="datetime-local"
              required
              value={closesAt}
              disabled={busy || closed}
              onChange={(e) => setClose(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" disabled={busy || closed}>
          Guardar fechas
        </button>
      </form>
      <h2>Resolver predicciones</h2>
      <p>
        Publica los clasificados y los premios manuales después del cierre. Deja sin seleccionar las
        preguntas pendientes. Para corregir un resultado, modifica la selección y vuelve a publicar.
      </p>
      <CrystalFields
        questions={manual}
        answers={answers}
        onChange={setAnswers}
        disabled={busy || !closed}
        manual
      />
      <div className="crystal-actions">
        <button
          type="button"
          disabled={busy || !closed}
          onClick={() => void perform(() => resolve(answers, false))}
        >
          Publicar resultados manuales
        </button>
        <button
          type="button"
          disabled={busy || !closed}
          onClick={() => void perform(() => resolve(answers, true))}
        >
          Calcular resultados automáticos
        </button>
      </div>
      <p>
        Calcula las estadísticas cuando todas las series hayan terminado y todos los mapas estén
        importados. Los empates aceptan cualquiera de los ganadores. Las preguntas sin datos
        suficientes quedan pendientes.
      </p>
      <output>{busy ? 'Guardando…' : message}</output>
    </details>
  );
}
