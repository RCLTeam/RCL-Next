import { useEffect, useState } from 'react';
import {
  type ChampionArtVariant,
  type ChampionSkinArt,
  type GameAsset,
  loadChampionArt,
  selectChampionArt
} from './riot-assets.service.js';

/** Wait for metadata before loading an image; original base art needs no metadata. */
export function useChampionArt(asset: GameAsset, variant: ChampionArtVariant, skinId?: number) {
  const championId = asset.championId;
  const needsMetadata = !!championId && !(variant === 'original' && skinId === undefined);
  const [loaded, setLoaded] = useState<{ id: number; skins: ChampionSkinArt[] }>();

  useEffect(() => {
    let active = true;
    if (needsMetadata && championId) {
      void loadChampionArt(championId).then(
        (skins) => {
          if (active) setLoaded({ id: championId, skins });
        },
        () => {
          if (active) setLoaded({ id: championId, skins: [] });
        }
      );
    }
    return () => {
      active = false;
    };
  }, [championId, needsMetadata]);

  if (needsMetadata && loaded?.id !== championId) return [];
  if (!needsMetadata) return asset.splashImage ? [asset.splashImage] : [];

  const skin = selectChampionArt(loaded?.skins ?? [], skinId);
  return [
    ...new Set(
      variant === 'original'
        ? [skin?.original, asset.splashImage]
        : [skin?.[variant], skin?.centered, asset.splashImage]
    )
  ].filter((source): source is string => Boolean(source));
}
