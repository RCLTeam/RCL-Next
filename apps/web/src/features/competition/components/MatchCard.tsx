import React from 'react';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { safeStreamUrl } from '../api/competition-api.js';
import type { Match } from '../types/competition.types.js';
import { TeamBadge } from './TeamBadge.js';
import './match-card.css';

export const matchStatus: Record<Match['status'], string> = {
  scheduled: 'Programado',
  live: 'En directo',
  completed: 'Finalizado',
  forfeit: 'Incomparecencia',
  cancelled: 'Cancelado'
};

export function MatchCard({ match }: { match: Match }) {
  const stream = safeStreamUrl(match.streamUrl);
  const scheduled = match.scheduledAt ? new Date(match.scheduledAt) : null;
  const validDate = scheduled && Number.isFinite(scheduled.getTime());
  const showScore = ['live', 'completed', 'forfeit'].includes(match.status);
  return (
    <article
      className={`match-row ${match.status === 'live' ? 'is-live' : ''}`}
      aria-label={`${match.homeTeam?.name ?? 'Por definir'} contra ${match.awayTeam?.name ?? 'Por definir'}`}
    >
      <div className="match-date">
        {validDate ? (
          <time dateTime={match.scheduledAt ?? undefined}>
            {scheduled.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
            <strong>
              {scheduled.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </strong>
          </time>
        ) : (
          <span>
            Fecha
            <br />
            por confirmar
          </span>
        )}
      </div>
      <div className="match-teams">
        <span>
          <TeamBadge team={match.homeTeam} />
          {match.homeTeam?.name ?? 'Por definir'}
        </span>
        <strong className="match-score">
          {showScore ? `${match.homeScore}–${match.awayScore}` : 'VS'}
        </strong>
        <span>
          {match.awayTeam?.name ?? 'Por definir'}
          <TeamBadge team={match.awayTeam} />
        </span>
      </div>
      <div className="match-meta">
        <span>{match.round?.name ?? 'Jornada por confirmar'}</span>
        <span>
          BO{match.bestOf} · {matchStatus[match.status]}
        </span>
      </div>
      <div className="match-actions">
        {['completed', 'forfeit'].includes(match.status) && (
          <SiteLink
            className="text-link match-detail-link"
            href={`/partidos/${encodeURIComponent(match.slug ?? match.id)}`}
            aria-label={`Ver partido ${match.homeTeam?.name ?? ''} contra ${match.awayTeam?.name ?? ''}`}
          >
            Ver partido →
          </SiteLink>
        )}
        {stream ? (
          <a className="text-link match-stream-link" href={stream} target="_blank" rel="noreferrer">
            Ver emisión ↗
          </a>
        ) : (
          <span className="meta">Sin emisión</span>
        )}
      </div>
    </article>
  );
}
