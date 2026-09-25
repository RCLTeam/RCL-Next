import React, { type ReactNode } from 'react';
import { Select } from '../../../shared/components/Selector/Selector.js';
import './competition-filters.css';
import type { Competition } from '../hooks/useCompetition.js';
import { DivisionSwitch } from './DivisionSwitch.js';

export function CompetitionFilters({
  competition,
  children
}: { competition: Competition; children?: ReactNode }) {
  const selectId = React.useId();
  return (
    <>
      <label htmlFor={`${selectId}-1`} className="select-field season-field">
        Temporada
        <Select
          id={`${selectId}-1`}
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
        </Select>
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
