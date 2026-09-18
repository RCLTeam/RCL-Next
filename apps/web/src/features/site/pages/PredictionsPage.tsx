import React from 'react';
import type { Competition } from '../../competition/hooks/useCompetition.js';
import { CompetitionFilters } from '../components/CompetitionFilters.js';
import { DataState, TeamBadge, resolveCompetitionState } from '../components/CompetitionViews.js';
import { PageLayout } from '../components/PageLayout.js';

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
            <article className="prediction-card" key={match.id}>
              <div className="prediction-teams">
                <span>
                  <TeamBadge team={match.homeTeam} />
                  {match.homeTeam?.name ?? 'Por definir'}
                </span>
                <b className="meta">VS</b>
                <span>
                  <TeamBadge team={match.awayTeam} />
                  {match.awayTeam?.name ?? 'Por definir'}
                </span>
              </div>
              <div className="prediction-meta">
                <span>
                  {match.round?.name ?? 'Jornada por confirmar'} · BO{match.bestOf}
                </span>
                <span>Votación no disponible</span>
              </div>
            </article>
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
