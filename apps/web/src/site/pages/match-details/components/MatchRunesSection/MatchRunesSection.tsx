import type { MatchParticipant } from '@rcl/contracts';
import React, { useEffect, useRef } from 'react';
import { GameIcon } from '../../../../../shared/riot/GameIcon.js';
import { STAT_SHARD_SLOTS } from '../../../../../shared/riot/data-dragon.service.js';
import { type GameCatalog, getRuneTrees } from '../../../../../shared/riot/riot-assets.service.js';
import { matchPosition } from '../../match-stats.js';
import './match-runes-section.css';

export function MatchRunesDialog({
  runePlayer,
  catalog,
  onClose
}: { runePlayer: MatchParticipant; catalog: GameCatalog; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (!dialog.current) return;
    const rect = dialog.current.getBoundingClientRect();
    const isClickOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (isClickOutside) {
      onClose();
    }
  };
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);
  const selectedRuneIds = new Set(
    runePlayer?.runes
      ? [
          Number(runePlayer.runes.primaryKeystoneId),
          Number(runePlayer.runes.primaryPerk1),
          Number(runePlayer.runes.primaryPerk2),
          Number(runePlayer.runes.primaryPerk3),
          Number(runePlayer.runes.secundaryPerk1),
          Number(runePlayer.runes.secundaryPerk2),
          Number(runePlayer.runes?.statPerkOffense),
          Number(runePlayer.runes?.statPerkFlex),
          Number(runePlayer.runes?.statPerkDefense)
        ]
      : []
  );
  const primaryTreeId = runePlayer?.runes?.primaryPerk
    ? Number(runePlayer.runes.primaryPerk)
    : undefined;
  const secondaryTreeId = runePlayer?.runes?.secundaryRuneId
    ? Number(runePlayer.runes.secundaryRuneId)
    : undefined;
  const [primaryTree] = primaryTreeId ? getRuneTrees(catalog, primaryTreeId) : [];
  const [secondaryTree] = secondaryTreeId ? getRuneTrees(catalog, secondaryTreeId) : [];
  return (
    <dialog
      ref={dialog}
      className="match-runes-dialog"
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="match-runes-toolbar">
        <h2 id={titleId}>Runas de {runePlayer.gameName}</h2>

        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Cerrar runas">
          Cerrar ×
        </button>
      </div>
      <article className="match-rune-card">
        <div className="match-rune-card-header">
          <p className="meta">
            {matchPosition(runePlayer.position)} · {runePlayer.champion}
          </p>
        </div>
        {!runePlayer.runes ? (
          <p className="empty-state">Runas no disponibles.</p>
        ) : (
          <div className="match-rune-grid-layout">
            <div className="match-rune-branch">
              {primaryTree?.slots ? (
                primaryTree.slots.map((slot, rowIndex) => (
                  <div
                    key={slot.runes.map((rune) => rune.id).join('-')}
                    className={`rune-row ${rowIndex === 0 ? 'keystone-row' : ''}`}
                  >
                    {slot.runes.map((rune) => {
                      const isSelected = selectedRuneIds.has(rune.id);
                      return (
                        <div
                          key={rune.id}
                          className={`rune-node ${isSelected ? 'is-active' : 'is-disabled'}`}
                        >
                          <GameIcon kind="rune" id={rune.id} catalog={catalog} />
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                <p className="empty-state">Cargando árbol principal...</p>
              )}
            </div>
            <div className="match-rune-branch">
              {secondaryTree?.slots ? (
                secondaryTree.slots.slice(1).map((slot) => (
                  <div key={slot.runes.map((rune) => rune.id).join('-')} className="rune-row">
                    {slot.runes.map((rune) => {
                      const isSelected = selectedRuneIds.has(rune.id);
                      return (
                        <div
                          key={rune.id}
                          className={`rune-node ${isSelected ? 'is-active' : 'is-disabled'}`}
                        >
                          <GameIcon kind="rune" id={rune.id} catalog={catalog} />
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                <p className="empty-state">Cargando árbol secundario...</p>
              )}
              <div className="shards-container">
                {STAT_SHARD_SLOTS.map((slot, rowIdx) => (
                  <div key={slot.name} className="shard-row">
                    {slot.runes.map((shard) => {
                      const selectedShards = [
                        runePlayer.runes?.statPerkOffense,
                        runePlayer.runes?.statPerkFlex,
                        runePlayer.runes?.statPerkDefense
                      ];
                      const isSelected = Number(selectedShards[rowIdx]) === shard.id;
                      return (
                        <div
                          key={shard.id}
                          className={`shard-node ${isSelected ? 'is-active' : 'is-disabled'}`}
                        >
                          <GameIcon kind="rune" id={shard.id} catalog={catalog} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </article>
    </dialog>
  );
}
