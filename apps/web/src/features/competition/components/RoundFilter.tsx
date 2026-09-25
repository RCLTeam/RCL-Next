import React from 'react';
import { Select } from '../../../shared/components/Selector/Selector.js';
import './competition-filters.css';
import type { Round } from '../types/competition.types.js';

export function RoundFilter({
  rounds,
  value,
  onChange
}: { rounds: Round[]; value: string; onChange: (value: string) => void }) {
  const selectId = React.useId();
  return (
    <label htmlFor={`${selectId}-1`} className="select-field">
      Jornada
      <Select
        id={`${selectId}-1`}
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
      </Select>
    </label>
  );
}
