import type { MatchParticipant } from '@rcl/contracts';
import React from 'react';
import { GameIcon } from '../../../shared/riot/GameIcon.js';
import type { GameCatalog } from '../../../shared/riot/riot-assets.service.js';
import { statNumber } from './match-stats.js';

export function MatchPlayerSummary({
  player,
  catalog,
  teamName
}: { player: MatchParticipant | undefined; catalog: GameCatalog; teamName: string }) {
  if (!player) return <div className="player-summary empty-state">Jugador no disponible</div>;
  const build = player.build;
  const slots = ['item0', 'item1', 'item2', 'item3', 'item4', 'item5'] as const;
  return (
    <article className="player-summary" aria-label={`Resumen de ${player.gameName}`}>
      <p className="player-summary-team">{teamName}</p>
      <div className="player-summary-slots" aria-label={`Build de ${player.gameName}`}>
        <div className="player-summary-group spells-group">
          <div className="spell-item">
            <GameIcon kind="summoner" id={build?.summonerSpell1Id ?? null} catalog={catalog} />
          </div>
          <div className="spell-item">
            <GameIcon kind="summoner" id={build?.summonerSpell2Id ?? null} catalog={catalog} />
          </div>
        </div>
        <div className="player-summary-group trinket-group" aria-label="Trinket">
          <GameIcon kind="item" id={build?.trinket ?? null} catalog={catalog} />
        </div>
        <div className="player-summary-group items-group">
          {slots.map((slot, index) => (
            <div className="player-summary-slot" key={slot} aria-label={`Objeto ${index + 1}`}>
              <GameIcon kind="item" id={build?.[slot] ?? null} catalog={catalog} />
            </div>
          ))}
        </div>
        <div className="player-summary-group champion-group">
          <GameIcon kind="champion" id={player.champion} catalog={catalog} />
        </div>
      </div>
      <div className="player-summary-caption">
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
      </div>
      {!build && <p className="player-summary-missing meta">Build no disponible</p>}
    </article>
  );
}
