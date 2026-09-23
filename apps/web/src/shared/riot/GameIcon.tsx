import React, { useState } from 'react';
import { type GameAssetKind, type GameCatalog, statShardAssets } from './data-dragon.service.js';
import './game-icon.css';

export function GameIcon({
  kind,
  id,
  catalog,
  label = false
}: { kind: GameAssetKind; id: string | number | null; catalog: GameCatalog; label?: boolean }) {
  const asset = catalog[`${kind}:${id}`] ?? statShardAssets[`${kind}:${id}`];
  const [failed, setFailed] = useState<string>();
  const fallback =
    kind === 'champion'
      ? String(id)
      : `${kind === 'item' ? 'Objeto' : kind === 'summoner' ? 'Hechizo' : 'Runa'} ${id}`;
  const name = id ? (asset?.name ?? fallback) : 'Hueco vacío';
  return (
    <span className={`game-asset ${label ? 'with-label' : ''}`} title={name}>
      {asset?.image && failed !== asset.image ? (
        <img
          src={asset.image}
          alt={label ? '' : name}
          loading="lazy"
          onError={() => setFailed(asset.image)}
        />
      ) : (
        <span className="game-asset-fallback" aria-label={name}>
          {id ? String(id).slice(0, 8) : '—'}
        </span>
      )}
      {label && <span>{name}</span>}
    </span>
  );
}
