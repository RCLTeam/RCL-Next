import React from 'react';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { PredictionCard } from './PredictionCard.js';
import { PredictionRules } from './PredictionRules.js';
import { PredictorRankingPanel } from './PredictorRankingPanel.js';
import '../players/ranking-panel.css';
import './predictions.css';

export function PredictionsPage({ competition }: { competition: Competition }) {
  const upcoming = competition.calendar.data.filter((match) => match.status === 'scheduled');
  return (
    <PageLayout
      id="predicciones"
      number="09"
      title="Elige tu ganador"
      subtitle="Predicciones de la comunidad"
      description="La quiniela de cada jornada: sigue las próximas series y prepárate para elegir a tus favoritos."
      toolbar={
        <CompetitionFilters competition={competition}>
          <span className="availability">Votaciones próximamente</span>
        </CompetitionFilters>
      }
    >
      <PredictionRules />
      <DataState
        state={resolveCompetitionState(competition, { ...competition.calendar, data: upcoming })}
        retry={competition.retry}
        empty="Todavía no hay próximos encuentros para esta división."
      >
        <div className="prediction-grid">
          {upcoming.map((match) => (
            <PredictionCard key={match.id} match={match} />
          ))}
        </div>
      </DataState>
      <PredictorRankingPanel />
    </PageLayout>
  );
}
