export interface RuneDetail {
  id: number;
  key: string;
  icon: string;
  name: string;
  shortDesc: string;
  longDesc: string;
}

export interface RuneSlot {
  runes: RuneDetail[];
}

export interface RuneTree {
  id: number;
  key: string;
  icon: string;
  name: string;
  slots: RuneSlot[];
}

export interface StatShardSlot {
  name: string;
  runes: Pick<RuneDetail, 'id' | 'name' | 'key' | 'icon'>[];
}

export interface GameAsset {
  name: string;
  image?: string | undefined;
  splashImage?: string | undefined;
  tree?: RuneTree | undefined;
  trees?: RuneTree[] | undefined;
  slots?: StatShardSlot[] | undefined;
}

export type GameAssetKind = 'item' | 'champion' | 'summoner' | 'rune' | 'position' | 'runeTree';
export type GameCatalog = Record<string, GameAsset>;
