export interface GameAsset {
  name: string;
  image?: string | undefined;
}
export type GameAssetKind = 'item' | 'champion' | 'summoner' | 'rune' | 'position';
export type GameCatalog = Record<string, GameAsset>;
