import { PlayoffBracket } from '../components/PlayoffBracket.js';
import './playoffs.css';
import React from 'react';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { CompetitionFilters } from '../../competition/components/CompetitionFilters.js';
import { DataState } from '../../competition/components/CompetitionViews.js';
import type { Competition } from '../../competition/hooks/useCompetition.js';
export function PlayoffsPage({ competition }: { competition: Competition }) {
  // The API supplies round names and sequence; no bracket progression is invented.
  const rounds = competition.rounds.data
    .filter((round) => round.stage === 'playoff')
    .sort((a, b) => a.sequence - b.sequence);
  const state = [
    competition.seasons,
    competition.divisions,
    competition.rounds,
    competition.calendar
  ].find((item) => item.status !== 'ready');
  return (
    <PageLayout
      id="playoffs"
      number="11"
      title="Playoffs"
      subtitle="La corona vacía"
      description="El último paso hacia el trono. Sigue las eliminatorias de tu división."
      toolbar={<CompetitionFilters competition={competition} />}
    >
      <DataState
        state={state ? { status: state.status, data: [] } : { status: 'ready', data: rounds }}
        retry={competition.retry}
        empty="Los cruces aparecerán cuando se publiquen las jornadas de playoffs."
      >
        <PlayoffBracket rounds={rounds} matches={competition.calendar.data} />
      </DataState>
    </PageLayout>
  );
}
