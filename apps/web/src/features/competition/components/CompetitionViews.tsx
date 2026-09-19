import React, { type ReactNode, useState } from 'react';
import { safeStreamUrl } from '../api/competition-api.js';
import type { Competition } from '../hooks/useCompetition.js';
import type { CollectionState, Match, Team } from '../types/competition.types.js';

export function DivisionSwitch({ competition }: { competition: Competition }) {
  if (competition.divisions.data.length === 0) return null;
  return (
    <fieldset className="league-switch" aria-label="Seleccionar división">
      {competition.divisions.data.map((division) => (
        <button
          key={division.id}
          type="button"
          aria-pressed={competition.division?.id === division.id}
          data-division={division.code.toLowerCase()}
          onClick={() => competition.selectDivision(division.id)}
        >
          {division.name}
        </button>
      ))}
    </fieldset>
  );
}

export function resolveCompetitionState<T>(
  competition: Competition,
  state: CollectionState<T>
): CollectionState<T> {
  const parent =
    competition.seasons.status !== 'ready' ? competition.seasons : competition.divisions;
  return parent.status !== 'ready' ? { status: parent.status, data: [] } : state;
}

export function DataState<T>({
  state,
  empty,
  retry,
  children
}: {
  state: CollectionState<T>;
  empty: string;
  retry: () => void;
  children: ReactNode;
}) {
  if (state.status === 'loading')
    return <output className="empty-state">Cargando competición…</output>;
  if (state.status === 'error')
    return (
      <div className="empty-state error-state" role="alert">
        <p>No se pudo cargar la competición.</p>
        <button className="btn-ghost" type="button" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  if (state.data.length === 0)
    return (
      <div className="empty-state">
        <p>{empty}</p>
      </div>
    );
  return <>{children}</>;
}

export function TeamBadge({ team }: { team: Team | undefined }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = safeStreamUrl(team?.logoUrl ?? null);
  return (
    <span className="team-badge" aria-hidden="true">
      {url && url !== failedUrl ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} />
      ) : (
        (team?.shortName ?? team?.name ?? '?').slice(0, 3).toUpperCase()
      )}
    </span>
  );
}

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
      {stream ? (
        <a className="text-link" href={stream} target="_blank" rel="noreferrer">
          Ver emisión ↗
        </a>
      ) : (
        <span className="meta">Sin emisión</span>
      )}
    </article>
  );
}
