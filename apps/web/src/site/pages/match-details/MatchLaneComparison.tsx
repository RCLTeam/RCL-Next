import type { MatchDetail, MatchMap } from '@rcl/contracts';
import React from 'react';
import { GameIcon } from '../../../shared/riot/GameIcon.js';
import type { GameCatalog } from '../../../shared/riot/riot-assets.service.js';
import { MatchPlayerSummary } from './MatchPlayerSummary.js';
import { positionRows } from './match-stats.js';

export function MatchLaneComparison({
  game,
  match,
  catalog
}: { game: MatchMap | undefined; match: MatchDetail; catalog: GameCatalog }) {
  const rows = game ? positionRows(game.participants, match.homeTeam.id, match.awayTeam.id) : [];
  return (
    <>
      {!game ? (
        <div className="empty-state">
          El resultado está registrado, pero todavía no se han importado los datos de las partidas.
        </div>
      ) : (
        <>
          {rows.length === 0 && (
            <div className="empty-state">Jugadores pendientes de importar para este mapa.</div>
          )}
          {rows.some((row) => row.position === 'SIN POSICIÓN') && (
            <p className="meta">Algunos jugadores no tienen posición registrada en este mapa.</p>
          )}
          <div className="match-lanes-scroll" aria-label="Comparativa de los equipos por posición">
            <div className="match-lane-heading">
              <span>
                {match.homeTeam.name} ·{' '}
                {game.blueTeamId === match.homeTeam.id ? 'Lado azul' : 'Lado rojo'}
              </span>
              <span>Posición</span>
              <span>
                {match.awayTeam.name} ·{' '}
                {game.blueTeamId === match.awayTeam.id ? 'Lado azul' : 'Lado rojo'}
              </span>
            </div>
            {rows.map((row) => (
              <div className="match-lane-row" key={row.key}>
                <MatchPlayerSummary
                  player={row.home}
                  catalog={catalog}
                  teamName={match.homeTeam.name}
                />
                <span className="match-lane-label">
                  <GameIcon kind="position" id={row.position} catalog={catalog} />
                </span>
                <MatchPlayerSummary
                  player={row.away}
                  catalog={catalog}
                  teamName={match.awayTeam.name}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
