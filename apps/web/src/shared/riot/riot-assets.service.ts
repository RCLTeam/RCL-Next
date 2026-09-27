import { getPositionAsset, positionAssets } from './community-dragon.service.js';
import { loadGameCatalog as loadDataDragonCatalog } from './data-dragon.service.js';
import { STAT_SHARD_SLOTS, statShardAssets } from './stat-shards.js';
export { STAT_SHARD_SLOTS } from './stat-shards.js';
import type { GameAssetKind, GameCatalog, RuneTree } from './riot-assets.types.js';

export type {
  GameAsset,
  GameAssetKind,
  GameCatalog,
  RuneDetail,
  RuneSlot,
  RuneTree
} from './riot-assets.types.js';

export const defaultGameCatalog: GameCatalog = {
  ...statShardAssets,
  ...positionAssets,
  'rune:statShards': { name: 'Fragmentos de Estadísticas', slots: STAT_SHARD_SLOTS }
};

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
  if (kind === 'champion' && id !== null) {
    const key = `champion:${id}`.toLowerCase();
    return (
      catalog[`${kind}:${id}`] ??
      Object.entries(catalog).find(([name]) => name.toLowerCase() === key)?.[1]
    );
  }
  return catalog[`${kind}:${id}`] ?? defaultGameCatalog[`${kind}:${id}`];
}

export function getRuneTrees(catalog: GameCatalog, treeId?: number): RuneTree[] {
  if (treeId) {
    const treeAsset = catalog[`runeTree:${treeId}`];
    return treeAsset?.tree ? [treeAsset.tree] : [];
  }
  return catalog['rune:trees']?.trees ?? [];
}

export function getStatShardSlots() {
  return STAT_SHARD_SLOTS;
}
