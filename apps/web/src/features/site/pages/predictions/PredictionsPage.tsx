import { PredictionCard } from './components/PredictionCard.js';
import './predictions.css';
import React from 'react';
import type { Competition } from '../../shared/competition/hooks/useCompetition.js';
import { CompetitionFilters } from '../../shared/components/CompetitionFilters.js';
import { DataState, resolveCompetitionState } from '../../shared/components/CompetitionViews.js';
import { PageLayout } from '../../shared/components/PageLayout.js';

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
      <div className="prediction-rules">
        <div>
          <b>01</b>
          <span>Elige al ganador</span>
        </div>
        <div>
          <b>02</b>
          <span>Predice el resultado</span>
        </div>
        <div>
          <b>03</b>
          <span>Sigue tus aciertos</span>
        </div>
      </div>
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
      <section className="ranking-panel" aria-labelledby="predictor-ranking">
        <h2 id="predictor-ranking" className="eyebrow">
          Ranking de predictores
        </h2>
        <p className="section-intro">
          La clasificación estará disponible cuando se abran las predicciones.
        </p>
      </section>
    </PageLayout>
  );
}
