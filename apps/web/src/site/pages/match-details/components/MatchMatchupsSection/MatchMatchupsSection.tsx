import type { MatchDetail, MatchMap, MatchParticipant } from '@rcl/contracts';
import React, { useState } from 'react';
import { GameIcon } from '../../../../../shared/riot/GameIcon.js';
import type { GameCatalog } from '../../../../../shared/riot/riot-assets.service.js';
import { positionRows, statNumber } from '../../match-stats.js';
import { MatchRunesDialog } from '../MatchRunesSection/MatchRunesSection.js';
import './match-matchups-section.css';

function PlayerSummary({
  player,
  catalog,
  teamName,
  onSelect
}: {
  player: MatchParticipant | undefined;
  catalog: GameCatalog;
  teamName: string;
  onSelect: (player: MatchParticipant) => void;
}) {
  if (!player) return <div className="player-summary empty-state">Jugador no disponible</div>;
  const build = player.build;
  const slots = ['item0', 'item1', 'item2', 'item3', 'item4', 'item5'] as const;
  const items = slots.map((slot) => build?.[slot] ?? null);
  const orderedItems = [...items.filter((id) => id), ...items.filter((id) => !id)];
  return (
    <button
      type="button"
      className="player-summary"
      aria-haspopup="dialog"
      aria-label={`Ver runas de ${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''}`}
      onClick={() => onSelect(player)}
    >
      <span className="player-summary-team">{teamName}</span>
      <span className="player-summary-slots" aria-label={`Build de ${player.gameName}`}>
        <span className="player-summary-group spells-group">
          <span className="spell-item">
            <GameIcon kind="summoner" id={build?.summonerSpell1Id ?? null} catalog={catalog} />
          </span>
          <span className="spell-item">
            <GameIcon kind="summoner" id={build?.summonerSpell2Id ?? null} catalog={catalog} />
          </span>
        </span>
        <span className="player-summary-group trinket-group" aria-label="Trinket">
          <GameIcon kind="item" id={build?.trinket ?? null} catalog={catalog} />
        </span>
        <span className="player-summary-group items-group">
          {slots.map((slot, index) => (
            <span className="player-summary-slot" key={slot} aria-label={`Objeto ${index + 1}`}>
              <GameIcon kind="item" id={orderedItems[index] ?? null} catalog={catalog} />
            </span>
          ))}
        </span>
        <span className="player-summary-group champion-group">
          <GameIcon kind="champion" id={player.champion} catalog={catalog} />
        </span>
      </span>
      <span className="player-summary-caption">
        <strong className="player-summary-kda" title="Asesinatos / Muertes / Asistencias">
          {player.stats
            ? `${statNumber(player.stats.kills)} / ${statNumber(player.stats.deaths)} / ${statNumber(player.stats.assists)}`
            : 'K/D/A —'}
        </strong>
        <strong className="player-summary-name">
          {player.gameName}
          {player.riotTag ? `#${player.riotTag}` : ''}
        </strong>
        <span className="player-summary-champion-name">
          {catalog[`champion:${player.champion}`]?.name ?? player.champion}
        </span>
      </span>
      {!build && <span className="player-summary-missing meta">Build no disponible</span>}
    </button>
  );
}

export function MatchMatchupsSection({
  game,
  match,
  catalog
}: { game: MatchMap | undefined; match: MatchDetail; catalog: GameCatalog }) {
  const [runePlayer, setRunePlayer] = useState<MatchParticipant | null>(null);
  const rows = game ? positionRows(game.participants, match.homeTeam.id, match.awayTeam.id) : [];

  return (
    <section
      id="enfrentamientos"
      role="tabpanel"
      aria-labelledby="tab-enfrentamientos"
      className="match-report-section"
    >
      <h2>01 · Enfrentamientos por posición y runas</h2>
      <p className="meta">
        Campeones, K/D/A y build final · Pulsa la tarjeta de un jugador para ver sus runas
      </p>
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
                <PlayerSummary
                  player={row.home}
                  catalog={catalog}
                  onSelect={setRunePlayer}
                  teamName={match.homeTeam.name}
                />
                <span className="match-lane-label">
                  <GameIcon kind="position" id={row.position} catalog={catalog} />
                </span>
                <PlayerSummary
                  player={row.away}
                  catalog={catalog}
                  onSelect={setRunePlayer}
                  teamName={match.awayTeam.name}
                />
              </div>
            ))}
          </div>
        </>
      )}
      {runePlayer && (
        <MatchRunesDialog
          runePlayer={runePlayer}
          catalog={catalog}
          onClose={() => setRunePlayer(null)}
        />
      )}
    </section>
  );
}
