import type React from 'react';
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

function TwitchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <title>Twitch</title>
      <path d="M11.571 4.714h1.715v5.143h-1.715zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}

function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <title>YouTube</title>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function MatchCard({ match }: { match: Match }) {
  console.log('Objeto match recibido:', match);
  const rawStreamUrl =
    match.status === 'live'
      ? match.streamUrlLive
      : match.status === 'completed'
        ? match.streamUrl
        : null;

  const stream = safeStreamUrl(rawStreamUrl);
  const scheduled = match.scheduledAt ? new Date(match.scheduledAt) : null;
  const validDate = scheduled && Number.isFinite(scheduled.getTime());
  const showScore = ['live', 'completed', 'forfeit'].includes(match.status);
  return (
    <article
      className={`match-row ${match.status === 'live' ? 'is-live' : ''}`}
      aria-label={`${match.homeTeam?.name ?? 'Por definir'} contra ${match.awayTeam?.name ?? 'Por definir'}`}
    >
      {['completed', 'forfeit'].includes(match.status) && (
        <SiteLink
          className="match-detail-link"
          href={`/partidos/${encodeURIComponent(match.slug ?? match.id)}`}
          aria-label={`Ver partido ${match.homeTeam?.name ?? ''} contra ${match.awayTeam?.name ?? ''}`}
        />
      )}
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
          {match.homeTeam ? (
            <SiteLink
              className="team-link"
              href={`/equipos/${encodeURIComponent(match.homeTeam.slug ?? match.homeTeam.id)}`}
              aria-label={`Ver perfil de ${match.homeTeam.name}`}
            >
              <TeamBadge team={match.homeTeam} />
              {match.homeTeam.name}
            </SiteLink>
          ) : (
            <>
              <TeamBadge team={match.homeTeam} />
              Por definir
            </>
          )}
        </span>
        <div className="match-score-container">
          {showScore ? (
            <label className="match-score-spoiler">
              <input type="checkbox" className="spoiler-toggle" />
              <span className="spoiler-cover">HAZ CLIC PARA VER MÁS</span>
              <strong className="match-score">{`${match.homeScore} – ${match.awayScore}`}</strong>
            </label>
          ) : (
            <strong className="match-score">VS</strong>
          )}
        </div>
        <span>
          {match.awayTeam ? (
            <SiteLink
              className="team-link"
              href={`/equipos/${encodeURIComponent(match.awayTeam.slug ?? match.awayTeam.id)}`}
              aria-label={`Ver perfil de ${match.awayTeam.name}`}
            >
              {match.awayTeam.name}
              <TeamBadge team={match.awayTeam} />
            </SiteLink>
          ) : (
            <>
              Por definir
              <TeamBadge team={match.awayTeam} />
            </>
          )}
        </span>
      </div>
      <div className="match-meta">
        <span>{match.round?.name ?? 'Jornada por confirmar'}</span>
        <span>
          BO{match.bestOf} · {matchStatus[match.status]}
        </span>
      </div>
      <div className="match-actions">
        {stream ? (
          <a
            className="text-link match-stream-link"
            href={stream}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {match.status === 'live' ? (
              <>
                <TwitchIcon /> Twitch
              </>
            ) : (
              <>
                <YoutubeIcon /> YouTube
              </>
            )}
          </a>
        ) : (
          <span className="meta">Sin emisión</span>
        )}
      </div>
    </article>
  );
}
