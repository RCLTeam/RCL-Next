import React, { useState } from 'react';
import { CompetitionFilters } from '../../site/components/CompetitionFilters.js';
import {
  DataState,
  MatchCard,
  resolveCompetitionState
} from '../../site/components/CompetitionViews.js';
import { PageLayout } from '../../site/components/PageLayout.js';
import type { Competition } from '../hooks/useCompetition.js';

export function CalendarPage({ competition }: { competition: Competition }) {
  const [roundChoice, setRoundChoice] = useState('');
  const roundKey = `${competition.division?.id ?? ''}:`;
  const roundId = roundChoice.startsWith(roundKey) ? roundChoice.slice(roundKey.length) : '';
  const matches = competition.calendar.data.filter(
    (match) => !roundId || match.round?.id === roundId
  );
  return (
    <PageLayout
      id="calendario"
      number="03"
      title="Calendario"
      subtitle="Cada mapa cuenta"
      description="Consulta los encuentros, las jornadas y los resultados de tu división."
      toolbar={
        <CompetitionFilters competition={competition}>
          <label className="select-field">
            Jornada
            <select
              value={roundId}
              onChange={(event) => setRoundChoice(`${roundKey}${event.target.value}`)}
              disabled={!competition.rounds.data.length}
            >
              <option value="">Todas las jornadas</option>
              {competition.rounds.data.map((round) => (
                <option key={round.id} value={round.id}>
                  {round.name ?? `Jornada ${round.sequence}`}
                </option>
              ))}
            </select>
          </label>
        </CompetitionFilters>
      }
    >
      {competition.rounds.status === 'error' && (
        <p className="status-note" role="alert">
          No se pudieron cargar los filtros de jornada.{' '}
          <button type="button" onClick={competition.retry}>
            Reintentar
          </button>
        </p>
      )}
      <DataState
        state={resolveCompetitionState(competition, competition.calendar)}
        empty="Todavía no hay partidos programados en esta división."
        retry={competition.retry}
      >
        <div className="match-list">
          {matches.length ? (
            matches.map((match) => <MatchCard key={match.id} match={match} />)
          ) : (
            <div className="empty-state">No hay partidos para esta jornada.</div>
          )}
        </div>
      </DataState>
    </PageLayout>
  );
}
