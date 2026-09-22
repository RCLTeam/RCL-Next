import React, { useEffect, useState } from 'react';

export interface GameAsset {
  name: string;
  image?: string | undefined;
}
export type GameCatalog = Record<string, GameAsset>;
const CDN = 'https://ddragon.leagueoflegends.com';
const fragments: GameCatalog = {
  'rune:5001': { name: 'Vida' },
  'rune:5002': { name: 'Armadura' },
  'rune:5003': { name: 'Resistencia mágica' },
  'rune:5005': { name: 'Velocidad de ataque' },
  'rune:5007': { name: 'Velocidad de habilidades' },
  'rune:5008': { name: 'Fuerza adaptable' }
};
let catalogRequest: Promise<GameCatalog> | undefined;
async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Catalog unavailable');
  return response.json();
}
export async function loadGameCatalog(): Promise<GameCatalog> {
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
  const catalog: GameCatalog = {};
  for (const [index, kind] of ['item', 'champion', 'summoner'].entries()) {
    const result = results[index];
    if (result?.status !== 'fulfilled') continue;
    for (const [id, raw] of Object.entries(result.value.data ?? {})) {
      const value = raw as { name: string; key?: string; image?: { full: string } };
      catalog[`${kind}:${kind === 'summoner' ? value.key : id}`] = {
        name: value.name,
        image: value.image
          ? `${base}/img/${kind === 'summoner' ? 'spell' : kind}/${encodeURIComponent(value.image.full)}`
          : undefined
      };
    }
  }
  const runes = results[3];
  if (runes?.status === 'fulfilled' && Array.isArray(runes.value)) {
    for (const tree of runes.value) {
      for (const rune of [
        tree,
        ...tree.slots.flatMap((slot: { runes: unknown[] }) => slot.runes)
      ]) {
        catalog[`rune:${rune.id}`] = { name: rune.name, image: `${CDN}/cdn/img/${rune.icon}` };
      }
    }
  }
  return catalog;
}
export function useGameCatalog() {
  const [catalog, setCatalog] = useState<GameCatalog>({});
  useEffect(() => {
    let active = true;
    catalogRequest ??= loadGameCatalog().catch(() => {
      catalogRequest = undefined;
      return {};
    });
    void catalogRequest.then((data) => {
      if (active) setCatalog(data);
    });
    return () => {
      active = false;
    };
  }, []);
  return catalog;
}
export function GameIcon({
  kind,
  id,
  catalog,
  label = false
}: { kind: string; id: string | number | null; catalog: GameCatalog; label?: boolean }) {
  const asset = catalog[`${kind}:${id}`] ?? fragments[`${kind}:${id}`];
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
