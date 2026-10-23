const CDN = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';

export interface ChampionSkinArt {
  id: number;
  isBase: boolean;
  name: string;
  centered?: string | undefined;
  original?: string | undefined;
  tile?: string | undefined;
  portrait?: string | undefined;
}

const requests = new Map<number, Promise<ChampionSkinArt[]>>();

/** Client paths are relative to lol-game-data; CommunityDragon paths are lowercase. */
function assetUrl(path: unknown): string | undefined {
  if (typeof path !== 'string' || !path.startsWith('/lol-game-data/assets/')) return;
  return `${CDN}/${path.slice('/lol-game-data/assets/'.length).toLowerCase()}`;
}

/** One request per visible champion, including all its skins. Failed requests can retry. */
export function loadChampionArt(championId: number): Promise<ChampionSkinArt[]> {
  if (!Number.isSafeInteger(championId) || championId <= 0) return Promise.resolve([]);
  const cached = requests.get(championId);
  if (cached) return cached;
  const request = fetch(`${CDN}/v1/champions/${championId}.json`, {
    signal: AbortSignal.timeout(10000)
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Champion art unavailable');
      const data = await response.json();
      if (!Array.isArray(data.skins)) throw new Error('Invalid champion art');
      return data.skins.flatMap((skin: Record<string, unknown>): ChampionSkinArt[] => {
        if (typeof skin.id !== 'number' || typeof skin.name !== 'string') return [];
        return [
          {
            id: skin.id,
            name: skin.name,
            isBase: skin.isBase === true,
            centered: assetUrl(skin.splashPath),
            original: assetUrl(skin.uncenteredSplashPath),
            tile: assetUrl(skin.tilePath),
            portrait: assetUrl(skin.loadScreenPath)
          }
        ];
      });
    })
    .catch((error: unknown) => {
      requests.delete(championId);
      throw error;
    });
  requests.set(championId, request);
  return request;
}

/** Skin IDs are Riot's full IDs (e.g. 103001), not Data Dragon skin numbers. */
export function selectChampionArt(skins: ChampionSkinArt[], skinId?: number) {
  return skins.find((skin) => skin.id === skinId) ?? skins.find((skin) => skin.isBase);
}
