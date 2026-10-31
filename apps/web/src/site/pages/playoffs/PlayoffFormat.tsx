import React from 'react';
import '../leagues/leagues.css';
import { matchStatus } from '../../../features/competition/components/MatchCard.js';
import { TeamBadge } from '../../../features/competition/components/TeamBadge.js';
import type { Match, Standing } from '../../../features/competition/types/competition.types.js';
import { LEAGUE_TIME_LABEL, formatLeagueDate } from '../../../shared/league-time.js';
import { type SlotId, buildPlayoff, outcome } from './playoff-model.js';

const slots = [
  {
    id: 'a',
    lane: 'upper',
    title: 'Upper · Ronda 1',
    teams: ['1.º', 'Rival elegido']
  },
  {
    id: 'b',
    lane: 'upper',
    title: 'Upper · Ronda 1',
    teams: ['Top 4 restante', 'Top 4 restante']
  },
  {
    id: 'u',
    lane: 'upper',
    title: 'Final upper',
    teams: ['Ganador upper', 'Ganador upper']
  },
  {
    id: 'c',
    lane: 'lower',
    title: 'Lower · Ronda 1',
    teams: ['5.º', 'Perdedor upper']
  },
  {
    id: 'd',
    lane: 'lower',
    title: 'Lower · Ronda 1',
    teams: ['6.º', 'Perdedor upper']
  },
  {
    id: 'l',
    lane: 'lower',
    title: 'Lower · Ronda 2',
    teams: ['Ganador lower', 'Ganador lower']
  },
  {
    id: 'lf',
    lane: 'lower',
    title: 'Final lower',
    teams: ['Perdedor upper', 'Ganador lower']
  },
  {
    id: 'f',
    lane: 'final',
    title: 'Gran final',
    teams: ['Ganador upper', 'Ganador lower']
  }
];

export function PlayoffFormat({ matches, standings }: { matches: Match[]; standings: Standing[] }) {
  const bracket = buildPlayoff(matches, standings);
  return (
    <section className="playoff-format" aria-labelledby="playoff-format-title">
      <header className="playoff-section-heading">
        <div>
          <span className="eyebrow">EL CAMINO A LA CORONA</span>
          <h2 id="playoff-format-title">Seis equipos. Una corona.</h2>
        </div>
        <span className="playoff-format-tag">DOBLE ELIMINACION · BO5</span>
      </header>
      <p className="playoff-format-intro">
        Formato de Premier y Ascend. Sigue las conexiones para descubrir como se llega a la gran
        final.
      </p>
      <section
        className="bracket-scroll"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Allows keyboard scrolling of the complete bracket.
        tabIndex={0}
        aria-label="Formato de playoffs: cuadro desplazable horizontalmente"
      >
        <div className="playoff-map">
          <svg
            className="playoff-connections"
            viewBox="0 0 1240 650"
            fill="none"
            aria-hidden="true"
          >
            <path
              className="upper-path"
              d="M260 105H285V190H640 M260 275H285V190 M900 190H935V360H970"
            />
            <path
              className="lower-path"
              d="M260 445H285V530H310 M260 615H285V530 M570 530H640 M900 530H935V400H970"
            />
            <path className="drop-path" d="M770 231V445" />
          </svg>
          {slots.map((slot) => {
            const entry = bracket[slot.id as SlotId];
            const match = entry.match;
            const winner = outcome(match, true);
            const showScore = match && ['live', 'completed', 'forfeit'].includes(match.status);
            return (
              <article
                key={slot.id}
                className={`playoff-slot playoff-slot-${slot.id} playoff-lane-${slot.lane}`}
              >
                <header>
                  <h3>{slot.title}</h3>
                  <span>BO{match?.bestOf ?? 5}</span>
                </header>
                <div className="playoff-slot-teams">
                  {slot.teams.map((team, index) => (
                    <div
                      key={`${slot.id}-${index}`}
                      className={
                        winner && winner.id === entry.teams[index]?.id
                          ? 'playoff-team-winner'
                          : undefined
                      }
                    >
                      {entry.teams[index] ? (
                        <TeamBadge team={entry.teams[index]} />
                      ) : (
                        <span className="playoff-seed" aria-hidden="true">
                          {slot.lane === 'final' ? '♛' : '—'}
                        </span>
                      )}
                      <span className="playoff-team-name" title={entry.teams[index]?.name ?? team}>
                        {entry.teams[index]?.name ?? team}
                      </span>
                      <b>{showScore ? (index === 0 ? match.homeScore : match.awayScore) : '—'}</b>
                    </div>
                  ))}
                </div>
                {match && (
                  <footer
                    className={`playoff-match-info ${match.status === 'live' ? 'is-live' : ''}`}
                  >
                    <span>{matchStatus[match.status]}</span>
                    {match.scheduledAt && (
                      <time dateTime={match.scheduledAt} title={LEAGUE_TIME_LABEL}>
                        {formatLeagueDate(match.scheduledAt, {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </time>
                    )}
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section className="format-grid playoff-rules" aria-label="Reglas de los playoffs">
        <article className="format-card">
          <span>01</span>
          <h3>El primero elige</h3>
          <p>El 1.º elige rival; los otros dos se cruzan.</p>
        </article>
        <article className="format-card">
          <span>02</span>
          <h3>Una segunda oportunidad</h3>
          <p>Perder en upper te baja; en lower te elimina.</p>
        </article>
        <article className="format-card">
          <span>03</span>
          <h3>Al mejor de cinco</h3>
          <p>Gana la serie quien consigue tres mapas.</p>
        </article>
      </section>
    </section>
  );
}
