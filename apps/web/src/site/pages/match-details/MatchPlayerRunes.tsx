import type { MatchParticipant } from '@rcl/contracts';
import React from 'react';
import { GameIcon } from '../../../shared/riot/GameIcon.js';
import type { GameCatalog } from '../../../shared/riot/riot-assets.service.js';
import { matchPosition } from './match-stats.js';

export function MatchPlayerRunes({
  player,
  catalog
}: { player: MatchParticipant; catalog: GameCatalog }) {
  const runes = player.runes;
  return (
    <article className="match-rune-card">
      <h4>{player.gameName}</h4>
      <p className="meta">
        {matchPosition(player.position)} · {player.champion}
      </p>
      {!runes ? (
        <p>Runas no disponibles.</p>
      ) : (
        <>
          <div className="match-rune-tree">
            <GameIcon kind="rune" id={runes.primaryPerk} catalog={catalog} label />
            <div className="match-rune-list">
              {[
                runes.primaryKeystoneId,
                runes.primaryPerk1,
                runes.primaryPerk2,
                runes.primaryPerk3
              ].map((id, index) => (
                <GameIcon key={`${index}-${id}`} kind="rune" id={id} catalog={catalog} label />
              ))}
            </div>
          </div>
          <div className="match-rune-tree">
            <GameIcon kind="rune" id={runes.secundaryRuneId} catalog={catalog} label />
            <div className="match-rune-list">
              {[runes.secundaryPerk1, runes.secundaryPerk2].map((id, index) => (
                <GameIcon key={`${index}-${id}`} kind="rune" id={id} catalog={catalog} label />
              ))}
            </div>
          </div>
          <dl className="match-shards">
            {[
              ['Ofensiva', runes.statPerkOffense],
              ['Flexible', runes.statPerkFlex],
              ['Defensiva', runes.statPerkDefense]
            ].map(([label, id]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <GameIcon kind="rune" id={id ?? null} catalog={catalog} label />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </article>
  );
}
