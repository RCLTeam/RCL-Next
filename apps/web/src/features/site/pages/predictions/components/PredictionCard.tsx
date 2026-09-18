import React from 'react';
import type { Match } from '../../../shared/competition/competition.types.js';
import { TeamBadge } from '../../../shared/components/CompetitionViews.js';

export function PredictionCard({ match }: { match: Match }) {
  return (
    <article className="prediction-card">
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
  );
}
