import React, { useEffect, useState } from 'react';
import {
  type ChampionSkinArt,
  loadChampionArt,
  selectChampionArt
} from '../riot/champion-art.service.js';
import type { GameAsset } from '../riot/riot-assets.types.js';

interface ChampionArtProps {
  asset: GameAsset;
  skinId?: number;
  variant?: 'portrait' | 'centered' | 'tile';
  className?: string;
  alt: string;
}

/** Uses Riot's prepared compositions, without per-champion positioning rules. */
export function ChampionArt({ asset, skinId, variant = 'centered', ...image }: ChampionArtProps) {
  const championId = asset.championId;
  const [loaded, setLoaded] = useState<{ id: number; skins: ChampionSkinArt[] }>();
  useEffect(() => {
    let active = true;
    if (championId) {
      void loadChampionArt(championId).then(
        (skins) => {
          if (active) setLoaded({ id: championId, skins });
        },
        () => {
          /* Keep the Data Dragon fallback if the metadata service fails. */
        }
      );
    }
    return () => {
      active = false;
    };
  }, [championId]);
  const skin = selectChampionArt(loaded?.id === championId ? (loaded?.skins ?? []) : [], skinId);
  const sources = [
    ...new Set([skin?.[variant], skin?.centered, asset.splashImage, asset.image])
  ].filter((source): source is string => Boolean(source));
  return <ArtImage key={sources.join('|')} sources={sources} {...image} />;
}

function ArtImage({
  sources,
  alt,
  className
}: {
  sources: string[];
  alt: string;
  className?: string | undefined;
}) {
  const [index, setIndex] = useState(0);
  if (!sources[index]) return null;
  return (
    <img
      src={sources[index]}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}
