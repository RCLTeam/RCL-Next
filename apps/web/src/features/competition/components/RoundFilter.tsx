import React from 'react';
import './competition-filters.css';
import type { Round } from '../types/competition.types.js';

export function RoundFilter({
  rounds,
  value,
  onChange
}: { rounds: Round[]; value: string; onChange: (value: string) => void }) {
  return (
    <label className="select-field">
      Jornada
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={!rounds.length}
      >
        <option value="">Todas las jornadas</option>
        {rounds.map((round) => (
          <option key={round.id} value={round.id}>
            {round.name ?? `Jornada ${round.sequence}`}
          </option>
        ))}
      </select>
    </label>
  );
}
