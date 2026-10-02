import type { MatchDetail } from '@rcl/contracts';
import React, { useEffect, useState } from 'react';
import { TeamBadge } from '../../../features/competition/components/TeamBadge.js';
import { useCompetitionDetail } from '../../../features/competition/hooks/useCompetitionDetail.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import type { GameCatalog } from '../../../shared/riot/riot-assets.service.js';
import { useGameCatalog } from '../../../shared/riot/useGameCatalog.js';
import { MatchMatchupsSection } from './components/MatchMatchupsSection/MatchMatchupsSection.js';
import { MatchStatsSection } from './components/MatchStatsSection/MatchStatsSection.js';
import './match-details-page.css';

export function MatchReport({
  match,
  catalog = {}
}: { match: MatchDetail; catalog?: GameCatalog }) {
  const [gameChoice, setGameChoice] = useState('');
  const [section, setSection] = useState<'enfrentamientos' | 'estadisticas'>('enfrentamientos');
  const game = match.games.find((item) => item.id === gameChoice) ?? match.games[0];
  const mvp = match.games
    .flatMap((item) => item.participants)
    .find((player) => player.playerId === match.mvpPlayerId);
  const winner =
    game?.winnerTeamId === match.homeTeam.id
      ? match.homeTeam.name
      : game?.winnerTeamId === match.awayTeam.id
        ? match.awayTeam.name
        : null;
  return (
    <>
      <div className="match-header-card">
        <div className="match-report-score">
          <div>
            <TeamBadge team={match.homeTeam} />
            <h2>{match.homeTeam.name}</h2>
          </div>
          <div>
            <span className="meta">
              {match.status === 'forfeit' ? 'Incomparecencia' : 'Resultado final'} · BO
              {match.bestOf}
            </span>
            <strong>
              {match.homeScore} – {match.awayScore}
            </strong>
          </div>
          <div>
            <TeamBadge team={match.awayTeam} />
            <h2>{match.awayTeam.name}</h2>
          </div>
        </div>
        {mvp && (
          <div className="match-series-mvp">
            <span className="meta">MVP del enfrentamiento</span>
            <SiteLink href={`/jugadores/${encodeURIComponent(mvp.playerId)}`}>
              {mvp.gameName}
              {mvp.riotTag ? `#${mvp.riotTag}` : ''}
            </SiteLink>
          </div>
        )}
        <div className="match-subcard-bar">
          <div className="match-context-col">
            {match.seasonName} · {match.divisionName}
            {match.roundName ? ` · ${match.roundName}` : ''}
          </div>
          <div className="match-selector-col">
            {match.games.length > 0 && (
              <div className="match-map-picker" role="toolbar" aria-label="Seleccionar mapa">
                {match.games.map((item) => (
                  <button
                    type="button"
                    className="btn-selector"
                    key={item.id}
                    aria-pressed={game?.id === item.id}
                    onClick={() => setGameChoice(item.id)}
                  >
                    Mapa {item.gameNumber}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="match-result-col">
            {game && (
              <p className="match-map-result">
                {winner ? `Victoria de ${winner} ` : 'Ganador no registrado'}
                {game.durationSeconds ? (
                  <span className="duration">
                    · {Math.floor(game.durationSeconds / 60)}:
                    {String(game.durationSeconds % 60).padStart(2, '0')}
                  </span>
                ) : null}
              </p>
            )}
          </div>
        </div>
      </div>
      <div>
        <div className="match-section-nav" role="tablist" aria-label="Secciones del partido">
          {(['enfrentamientos', 'estadisticas'] as const).map((id, index) => (
            <button
              key={id}
              type="button"
              className="btn-selector"
              role="tab"
              id={`tab-${id}`}
              aria-selected={section === id}
              aria-controls={id}
              tabIndex={section === id ? 0 : -1}
              onClick={() => setSection(id)}
            >
              {['Enfrentamiento', 'Estadísticas'][index]}
            </button>
          ))}
        </div>
        {section === 'enfrentamientos' && (
          <MatchMatchupsSection key={game?.id} game={game} match={match} catalog={catalog} />
        )}
        {section === 'estadisticas' && <MatchStatsSection game={game} match={match} />}
      </div>
    </>
  );
}

export function MatchDetailPage({ matchId }: { matchId: string }) {
  const { state, retry } = useCompetitionDetail('matches', matchId);
  const catalog = useGameCatalog();
  useEffect(() => {
    if (state.status === 'ready')
      document.title = `${state.data.homeTeam.name} vs ${state.data.awayTeam.name} · Rebel Crown Legacy`;
  }, [state]);
  return (
    <PageLayout
      id="partido"
      number="03"
      title="Ficha del partido"
      subtitle="Cada mapa cuenta"
      description="El resultado y todos los detalles de la serie."
    >
      {state.status === 'loading' && <output className="empty-state">Cargando partido…</output>}
      {state.status === 'missing' && (
        <div className="empty-state">
          Partido no disponible. La ficha se publica al terminar el encuentro.
        </div>
      )}
      {state.status === 'error' && (
        <div className="empty-state error-state" role="alert">
          <p>No se pudo cargar el partido.</p>
          <button className="btn-ghost" type="button" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <MatchReport key={state.data.id} match={state.data} catalog={catalog} />
      )}
    </PageLayout>
  );
}
