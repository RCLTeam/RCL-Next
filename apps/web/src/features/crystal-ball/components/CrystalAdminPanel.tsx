import React, { useState } from 'react';
import { Select } from '../../../shared/components/Selector/Selector.js';
import { useCompetitionSelection } from '../../competition/hooks/useCompetitionSelection.js';
import { crystalSelectionStatus } from '../hooks/crystal-selection-status.js';
import { useCrystalBall } from '../hooks/useCrystalBall.js';
import { CrystalAdmin } from './CrystalAdmin.js';
import './crystal-form.css';

export function CrystalAdminPanel() {
  const competition = useCompetitionSelection();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="crystal-admin-panel">
      <header className="crystal-section-heading">
        <span className="eyebrow">Predicciones de playoffs</span>
        <h2>Bola de cristal</h2>
        <p>
          Configura la participacion, publica los resultados y calcula los puntos de cada liga y
          temporada.
        </p>
      </header>
      <div className="page-toolbar">
        <Select
          label="Temporada"
          value={competition.season?.id ?? ''}
          disabled={busy}
          onChange={(e) => {
            if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
            setDirty(false);
            competition.selectSeason(e.target.value);
          }}
        >
          {competition.seasons.data.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          label="Liga"
          value={competition.division?.id ?? ''}
          disabled={busy || !competition.divisions.data.length}
          onChange={(e) => {
            if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
            setDirty(false);
            competition.selectDivision(e.target.value);
          }}
        >
          {competition.divisions.data.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      {!crystalSelectionStatus(competition) && competition.season && competition.division ? (
        <AdminSeason
          key={competition.division.id}
          divisionId={competition.division.id}
          season={competition.season.name}
          onDirty={setDirty}
          onBusy={setBusy}
        />
      ) : (
        <output>
          {crystalSelectionStatus(competition)}
          <button type="button" onClick={competition.retry}>
            Reintentar
          </button>
        </output>
      )}
    </div>
  );
}
function AdminSeason({
  season,
  divisionId,
  onDirty,
  onBusy
}: {
  season: string;
  divisionId: string;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const model = useCrystalBall(season, divisionId, undefined);
  if (!model.data)
    return model.error ? (
      <div role="alert">
        {model.error}
        <button type="button" onClick={model.retry}>
          Reintentar
        </button>
      </div>
    ) : (
      <output>Cargando campaña…</output>
    );
  return (
    <CrystalAdmin
      data={model.data}
      configure={model.configure}
      resolve={model.resolve}
      onDirty={onDirty}
      onBusy={onBusy}
    />
  );
}
