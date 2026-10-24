import React, { useState } from 'react';
import type { ChampionArtVariant, GameAsset } from './riot-assets.service.js';
import { useChampionArt } from './useChampionArt.js';

interface ChampionArtProps {
  asset: GameAsset;
  skinId?: number;
  variant?: ChampionArtVariant;
  className?: string;
  alt: string;
}

/** Uses Riot's prepared compositions, without per-champion positioning rules. */
export function ChampionArt({ asset, skinId, variant = 'centered', ...image }: ChampionArtProps) {
  const sources = useChampionArt(asset, variant, skinId);
  return <ArtImage sources={sources} {...image} />;
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
  const [failed, setFailed] = useState<string[]>([]);
  const source = sources.find((candidate) => !failed.includes(candidate));
  if (!source) return null;
  return (
    <img
      src={source}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed((current) => [...current, source])}
    />
  );
}
