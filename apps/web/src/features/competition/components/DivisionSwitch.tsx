import React from 'react';
import type { Competition } from '../hooks/useCompetition.js';
import './competition-filters.css';

export function DivisionSwitch({ competition }: { competition: Competition }) {
  if (competition.divisions.data.length === 0) return null;
  return (
    <fieldset className="league-switch" aria-label="Seleccionar división">
      {competition.divisions.data.map((division) => (
        <button
          key={division.id}
          type="button"
          aria-pressed={competition.division?.id === division.id}
          data-division={division.code.toLowerCase()}
          onClick={() => competition.selectDivision(division.id)}
        >
          {division.name}
        </button>
      ))}
    </fieldset>
  );
}
