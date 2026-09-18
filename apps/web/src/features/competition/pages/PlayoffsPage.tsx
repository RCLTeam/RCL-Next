import React from 'react';
import { CompetitionFilters } from '../../site/components/CompetitionFilters.js';
import { DataState, TeamBadge } from '../../site/components/CompetitionViews.js';
import { matchStatus } from '../../site/components/CompetitionViews.js';
import { PageLayout } from '../../site/components/PageLayout.js';
import type { Competition } from '../hooks/useCompetition.js';
export function PlayoffsPage({ competition }: { competition: Competition }) {
  // The API supplies round names and sequence; no bracket progression is invented.
  const rounds = competition.rounds.data
    .filter((round) => round.stage === 'playoff')
    .sort((a, b) => a.sequence - b.sequence);
  const state = [
    competition.seasons,
    competition.divisions,
    competition.rounds,
    competition.calendar
  ].find((item) => item.status !== 'ready');
  return (
    <PageLayout
      id="playoffs"
      number="11"
      title="Playoffs"
      subtitle="La corona vacía"
      description="El último paso hacia el trono. Sigue las eliminatorias de tu división."
      toolbar={<CompetitionFilters competition={competition} />}
    >
      <DataState
        state={state ? { status: state.status, data: [] } : { status: 'ready', data: rounds }}
        retry={competition.retry}
        empty="Los cruces aparecerán cuando se publiquen las jornadas de playoffs."
      >
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the bracket. */}
        <section className="bracket-scroll" aria-label="Cruces de playoffs" tabIndex={0}>
          <div className="bracket-grid">
            {rounds.map((round) => (
              <div className="bracket-column" key={round.id}>
                <h3 className="stage-label">{round.name ?? `Jornada ${round.sequence}`}</h3>
                {competition.calendar.data
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
                {!competition.calendar.data.some((match) => match.round?.id === round.id) && (
                  <div className="empty-state">Cruces por confirmar</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </DataState>
    </PageLayout>
  );
}
