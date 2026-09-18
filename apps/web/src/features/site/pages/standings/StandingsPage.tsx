import { StandingsTable } from './components/StandingsTable.js';
import './standings.css';
import React from 'react';
import type { Competition } from '../../shared/competition/hooks/useCompetition.js';
import { CompetitionFilters } from '../../shared/components/CompetitionFilters.js';
import { DataState, resolveCompetitionState } from '../../shared/components/CompetitionViews.js';
import { PageLayout } from '../../shared/components/PageLayout.js';

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
