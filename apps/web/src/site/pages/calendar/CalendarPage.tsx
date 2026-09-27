import React, { useState } from 'react';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import { RoundFilter } from '../../../features/competition/components/RoundFilter.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { MatchList } from './MatchList.js';
import './calendar.css';

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
        <MatchList matches={matches} />
      </DataState>
    </PageLayout>
  );
}
