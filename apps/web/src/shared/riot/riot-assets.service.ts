import { getPositionAsset, positionAssets } from './community-dragon.service.js';
import {
  loadGameCatalog as loadDataDragonCatalog,
  statShardAssets
} from './data-dragon.service.js';
import type { GameAssetKind, GameCatalog } from './riot-assets.types.js';

export type { GameAsset, GameAssetKind, GameCatalog } from './riot-assets.types.js';

export const defaultGameCatalog: GameCatalog = { ...statShardAssets, ...positionAssets };

/** Both providers remain usable independently when Data Dragon is unavailable. */
export async function loadGameCatalog(): Promise<GameCatalog> {
  try {
    return { ...defaultGameCatalog, ...(await loadDataDragonCatalog()) };
  } catch {
    return defaultGameCatalog;
  }
}

export function getGameAsset(
  kind: GameAssetKind,
  id: string | number | null,
  catalog: GameCatalog
) {
  if (kind === 'position') return getPositionAsset(id === null ? null : String(id));
  return catalog[`${kind}:${id}`] ?? defaultGameCatalog[`${kind}:${id}`];
}
