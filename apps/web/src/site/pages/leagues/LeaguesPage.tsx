import React from 'react';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import { DataState } from '../../../features/competition/components/CompetitionViews.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { CompetitionFormat } from './CompetitionFormat.js';
import { LeagueDivisionGrid } from './LeagueDivisionGrid.js';
import './league-cards.css';
import './leagues.css';

export function LeaguesPage({ competition }: { competition: Competition }) {
  return (
    <PageLayout
      id="ligas"
      number="02"
      title="Ligas"
      subtitle="Hub de competiciones"
      description="Descubre las divisiones, el formato de la competición y el camino hacia la corona."
      toolbar={<CompetitionFilters competition={competition} />}
    >
      <DataState
        state={competition.seasons}
        retry={competition.retry}
        empty="Todavía no hay temporadas publicadas."
      >
        <DataState
          state={competition.divisions}
          retry={competition.retry}
          empty="Esta temporada todavía no tiene divisiones."
        >
          <LeagueDivisionGrid
            divisions={competition.divisions.data}
            seasonName={competition.season?.name}
            onSelectDivision={competition.selectDivision}
          />
        </DataState>
      </DataState>
      <CompetitionFormat />
    </PageLayout>
  );
}
