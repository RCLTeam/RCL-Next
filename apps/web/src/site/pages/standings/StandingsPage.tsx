import React from 'react';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import { StandingsTable } from '../../../features/competition/components/StandingsTable.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import './standings.css';

export function StandingsPage({ competition }: { competition: Competition }) {
  return (
    <PageLayout
      id="clasificacion"
      number="04"
      title="Clasificación"
      subtitle="El camino a la corona"
      description="Sigue las victorias, los mapas y la posición de cada equipo en la fase regular."
      toolbar={
        <CompetitionFilters competition={competition}>
          <span className="meta">
            Fase regular · {competition.division?.name ?? 'Competición RCL'}
          </span>
        </CompetitionFilters>
      }
    >
      <DataState
        state={resolveCompetitionState(competition, competition.standings)}
        empty="La clasificación se publicará cuando haya equipos inscritos."
        retry={competition.retry}
      >
        <StandingsTable rows={competition.standings.data} />
      </DataState>
    </PageLayout>
  );
}
