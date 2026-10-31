import React from 'react';
import { DataState } from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import './playoffs.css';
import { PlayoffFormat } from './PlayoffFormat.js';

export function PlayoffsPage({ competition }: { competition: Competition }) {
  const state = [
    competition.seasons,
    competition.divisions,
    competition.rounds,
    competition.calendar,
    competition.standings
  ].find((item) => item.status !== 'ready');
  return (
    <PageLayout
      id="playoffs"
      number="10"
      title="Playoffs"
      subtitle="La corona vacía"
      description="El último paso hacia el trono. Sigue las eliminatorias de tu división."
      toolbar={<CompetitionFilters competition={competition} />}
    >
      <DataState
        state={state ? { status: state.status, data: [] } : { status: 'ready', data: [true] }}
        retry={competition.retry}
        empty="Los cruces aparecerán cuando se publiquen las jornadas de playoffs."
      >
        <PlayoffFormat matches={competition.calendar.data} standings={competition.standings.data} />
      </DataState>
    </PageLayout>
  );
}
