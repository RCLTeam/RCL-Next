import React from 'react';
import { discordLoginUrl } from '../../../features/auth/api/auth-api.js';
import { useAuth } from '../../../features/auth/components/AuthProvider.js';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { usePredictions } from '../../../features/predictions/usePredictions.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { PredictionCard } from './PredictionCard.js';
import { PredictionRules } from './PredictionRules.js';
import { PredictorRankingPanel } from './PredictorRankingPanel.js';
import './predictions.css';
export function PredictionsPage({ competition }: { competition: Competition }) {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.user.discordId : undefined;
  const predictions = usePredictions(competition.division?.id, userId);
  const data = predictions.data;
  const matches =
    data?.matches.flatMap((summary) => {
      const match = competition.calendar.data.find((m) => m.id === summary.matchId);
      return match ? [{ match, summary }] : [];
    }) ?? [];
  return (
    <PageLayout
      id="predicciones"
      number="09"
      title="Elige tu ganador"
      subtitle="Predicciones de la comunidad"
      description="Antes de cada jornada, vota quién crees que se lleva cada serie. Cada acierto suma puntos a tu clasificación personal de predictor."
    >
      <PredictionRules />
      <CompetitionFilters competition={competition}>
        <span className={`prediction-status${data?.open ? ' is-open' : ''}`}>
          {data
            ? data.open
              ? 'Votaciones abiertas · Hasta el martes 23:59'
              : 'Votaciones cerradas · Abren el lunes 00:00'
            : 'Cargando predicciones…'}
        </span>
      </CompetitionFilters>
      {data && (
        <p className="prediction-week eyebrow">
          Semana del{' '}
          {new Intl.DateTimeFormat('es-ES', {
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC'
          }).format(new Date(`${data.week}T00:00:00Z`))}
        </p>
      )}
      {state.status === 'anonymous' && data?.open && (
        <p className="prediction-login">
          <a href={discordLoginUrl}>Inicia sesión con Discord</a> para guardar tus predicciones.
        </p>
      )}
      <DataState
        state={resolveCompetitionState(competition, {
          status: predictions.error ? 'error' : !data ? 'loading' : competition.calendar.status,
          data: matches
        })}
        retry={() => {
          predictions.retry();
          competition.retry();
        }}
        empty="No hay encuentros programados para esta semana en esta división."
      >
        <div className="prediction-grid">
          {matches.map(({ match, summary }) => {
            const pick = predictions.picks.find((p) => p.matchId === match.id);
            return (
              <PredictionCard
                key={`${match.id}/${userId}/${pick?.selectedTeamId}/${pick?.homeScore}/${pick?.awayScore}`}
                match={match}
                summary={summary}
                pick={pick}
                authenticated={Boolean(userId)}
                save={predictions.save}
              />
            );
          })}
        </div>
      </DataState>
      {data && (
        <PredictorRankingPanel
          ranking={data.ranking}
          season={competition.season?.name}
          userId={userId}
        />
      )}
    </PageLayout>
  );
}
