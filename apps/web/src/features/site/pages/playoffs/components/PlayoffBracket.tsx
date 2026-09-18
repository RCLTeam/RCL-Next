import React from 'react';
import type { Match, Round } from '../../../shared/competition/competition.types.js';
import { TeamBadge, matchStatus } from '../../../shared/components/CompetitionViews.js';

export function PlayoffBracket({ rounds, matches }: { rounds: Round[]; matches: Match[] }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the bracket.
    <section className="bracket-scroll" aria-label="Cruces de playoffs" tabIndex={0}>
      <div className="bracket-grid">
        {rounds.map((round) => (
          <div className="bracket-column" key={round.id}>
            <h3 className="stage-label">{round.name ?? `Jornada ${round.sequence}`}</h3>
            {matches
              .filter((match) => match.round?.id === round.id)
              .map((match) => (
                <div className="bracket-match" key={match.id}>
                  <div>
                    <TeamBadge team={match.homeTeam} />
                    <span>{match.homeTeam?.name ?? 'Por definir'}</span>
                    <strong>
                      {['live', 'completed', 'forfeit'].includes(match.status)
                        ? match.homeScore
                        : '—'}
                    </strong>
                  </div>
                  <div>
                    <TeamBadge team={match.awayTeam} />
                    <span>{match.awayTeam?.name ?? 'Por definir'}</span>
                    <strong>
                      {['live', 'completed', 'forfeit'].includes(match.status)
                        ? match.awayScore
                        : '—'}
                    </strong>
                  </div>
                  <p className="meta">
                    BO{match.bestOf} · {matchStatus[match.status]}
                  </p>
                </div>
              ))}
            {!matches.some((match) => match.round?.id === round.id) && (
              <div className="empty-state">Cruces por confirmar</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
