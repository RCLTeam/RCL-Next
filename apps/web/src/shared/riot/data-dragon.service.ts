import { statShardAssets } from './stat-shards.js';
// Compatibility exports for existing consumers.
export { STAT_SHARD_SLOTS, statShardAssets } from './stat-shards.js';
import type { GameCatalog, RuneTree } from './riot-assets.types.js';

const CDN = 'https://ddragon.leagueoflegends.com';
let catalogRequest: Promise<GameCatalog> | undefined;
async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Catalog unavailable');
  return response.json();
}
async function fetchGameCatalog(): Promise<{ catalog: GameCatalog; complete: boolean }> {
  const versions = await json(`${CDN}/api/versions.json`);
  const version = versions[0];
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Invalid version');
  const base = `${CDN}/cdn/${version}`;
  const results = await Promise.allSettled(
    ['item', 'champion', 'summoner', 'runesReforged'].map((file) =>
      json(`${base}/data/es_ES/${file}.json`)
    )
  );
  const catalog: GameCatalog = { ...statShardAssets };
  for (const [index, kind] of ['item', 'champion', 'summoner'].entries()) {
    const result = results[index];
    if (result?.status !== 'fulfilled') continue;
    for (const [id, raw] of Object.entries(result.value.data ?? {})) {
      const value = raw as { name: string; key?: string; image?: { full: string } };
      catalog[`${kind}:${kind === 'summoner' ? value.key : id}`] = {
        name: value.name,
        ...(kind === 'champion'
          ? { splashImage: `${CDN}/cdn/img/champion/splash/${encodeURIComponent(id)}_0.jpg` }
          : {}),
        image: value.image
          ? `${base}/img/${kind === 'summoner' ? 'spell' : kind}/${encodeURIComponent(value.image.full)}`
          : undefined
      };
    }
  }
  const runes = results[3];
  if (runes?.status === 'fulfilled' && Array.isArray(runes.value)) {
    const trees = runes.value as RuneTree[];
    catalog['rune:trees'] = {
      name: 'Árboles de Runas',
      trees
    };
    for (const tree of trees) {
      const treeAsset = {
        name: tree.name,
        image: `${CDN}/cdn/img/${tree.icon}`,
        tree
      };
      catalog[`runeTree:${tree.id}`] = treeAsset;
      catalog[`rune:${tree.id}`] = treeAsset;
      for (const slot of tree.slots) {
        for (const rune of slot.runes) {
          catalog[`rune:${rune.id}`] = {
            name: rune.name,
            image: `${CDN}/cdn/img/${rune.icon}`
          };
        }
      }
    }
  }
  return { catalog, complete: results.every((result) => result.status === 'fulfilled') };
}

/** Shared by every consumer, including callers outside React. Failed or partial loads can retry. */
export function loadGameCatalog(): Promise<GameCatalog> {
  if (!catalogRequest) {
    catalogRequest = fetchGameCatalog().then(
      ({ catalog, complete }) => {
        if (!complete) catalogRequest = undefined;
        return catalog;
      },
      (error: unknown) => {
        catalogRequest = undefined;
        throw error;
      }
    );
  }
  return catalogRequest;
}
