import React, { type ReactNode } from 'react';
import './competition-filters.css';
import type { Competition } from '../hooks/useCompetition.js';
import { DivisionSwitch } from './CompetitionViews.js';

export function CompetitionFilters({
  competition,
  children
}: { competition: Competition; children?: ReactNode }) {
  return (
    <>
      <label className="select-field season-field">
        Temporada
        <select
          value={competition.season?.id ?? ''}
          onChange={(event) => competition.selectSeason(event.target.value)}
          disabled={!competition.seasons.data.length}
        >
          <option value="" disabled>
            Seleccionar temporada
          </option>
          {competition.seasons.data.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
      </label>
      {competition.divisions.data.length > 0 && (
        <div className="division-field">
          <span className="field-label">División</span>
          <DivisionSwitch competition={competition} />
        </div>
      )}
      {children && <div className="page-toolbar-extra">{children}</div>}
    </>
  );
}
