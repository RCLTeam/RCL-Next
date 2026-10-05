import React, { useState } from 'react';
import { discordLoginUrl } from '../../../features/auth/api/auth-api.js';
import { useAuth } from '../../../features/auth/components/AuthProvider.js';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import { RoundFilter } from '../../../features/competition/components/RoundFilter.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { isActiveTeam } from '../../../features/competition/team-visibility.js';
import { selectableRounds } from '../../../features/predictions/selectable-rounds.js';
import { usePredictions } from '../../../features/predictions/usePredictions.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { PredictionCard } from './PredictionCard.js';
import { PredictionRules } from './PredictionRules.js';
import { PredictorRankingPanel } from './PredictorRankingPanel.js';
import './predictions.css';
export function PredictionsPage({ competition }: { competition: Competition }) {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.user.discordId : undefined;
  const [roundChoice, setRoundChoice] = useState('');
  const roundKey = `${competition.division?.id ?? ''}:`;
  const selectedRound = roundChoice.startsWith(roundKey) ? roundChoice.slice(roundKey.length) : '';
  const predictions = usePredictions(competition.division?.id, userId, selectedRound || undefined);
  const data = predictions.data;
  const rounds = selectableRounds(competition.rounds.data, predictions.currentRound);
  const shownRound = competition.rounds.data.find((round) => round.id === data?.round);
  const matches =
    data?.matches.flatMap((summary) => {
      const match = competition.calendar.data.find((m) => m.id === summary.matchId);
      return match && isActiveTeam(match.homeTeam) && isActiveTeam(match.awayTeam)
        ? [{ match, summary }]
        : [];
    }) ?? [];
  return (
    <PageLayout
      id="predicciones"
      number="08"
      title="Elige tu ganador"
      subtitle="Predicciones de la comunidad"
      description="Antes de cada jornada, vota quién crees que se lleva cada serie. Cada acierto suma puntos a tu clasificación personal de predictor."
    >
      <div className="page-toolbar">
        <CompetitionFilters competition={competition}>
          <RoundFilter
            rounds={rounds}
            value={selectedRound || data?.round || predictions.currentRound || ''}
            onChange={(value) => setRoundChoice(`${roundKey}${value}`)}
          />
          <span className={`prediction-status${data?.open ? ' is-open' : ''}`}>
            {data
              ? data.open
                ? 'Votaciones abiertas · Hasta 1 hora antes de cada partido'
                : 'Sin partidos abiertos para votar'
              : predictions.error
                ? 'Predicciones no disponibles'
                : 'Cargando predicciones…'}
          </span>
        </CompetitionFilters>
      </div>
      {data && (
        <p className="prediction-week eyebrow">
          {shownRound ? (
            (shownRound.name ?? `Jornada ${shownRound.sequence}`)
          ) : (
            <>
              Semana del{' '}
              {new Intl.DateTimeFormat('es-ES', {
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC'
              }).format(new Date(`${data.week}T00:00:00Z`))}
            </>
          )}
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
        empty="No hay encuentros programados para esta jornada en esta división."
      >
        <div className="prediction-groups">
          {[true, false].map((open) => {
            const group = matches.filter(({ summary }) => summary.open === open);
            if (!group.length) return null;
            return (
              <section
                className="prediction-group"
                key={String(open)}
                aria-labelledby={`predictions-${open ? 'open' : 'closed'}`}
              >
                <h2
                  className="prediction-group-title"
                  id={`predictions-${open ? 'open' : 'closed'}`}
                >
                  {open ? 'Abiertas para votar' : 'Votaciones cerradas'}
                  <span>{group.length}</span>
                </h2>
                <div className="prediction-grid">
                  {group.map(({ match, summary }) => {
                    const pick = predictions.picks.find((p) => p.matchId === match.id);
                    return (
                      <PredictionCard
                        key={`${match.id}/${userId}`}
                        match={match}
                        summary={summary}
                        pick={pick}
                        authenticated={Boolean(userId)}
                        save={predictions.save}
                      />
                    );
                  })}
                </div>
              </section>
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
      <PredictionRules />
    </PageLayout>
  );
}
