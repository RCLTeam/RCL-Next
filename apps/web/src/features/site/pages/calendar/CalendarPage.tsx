import { RoundFilter } from './components/RoundFilter.js';
import './calendar.css';
import React, { useState } from 'react';
import type { Competition } from '../../shared/competition/hooks/useCompetition.js';
import { CompetitionFilters } from '../../shared/components/CompetitionFilters.js';
import {
  DataState,
  MatchCard,
  resolveCompetitionState
} from '../../shared/components/CompetitionViews.js';
import { PageLayout } from '../../shared/components/PageLayout.js';

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
          <RoundFilter
            rounds={competition.rounds.data}
            value={roundId}
            onChange={(value) => setRoundChoice(`${roundKey}${value}`)}
          />
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
