import React from 'react';
import { brandAssets } from '../../../shared/resources/assets.js';
import { SiteLink } from '../../site/navigation.js';

export function LeagueCard({
  name,
  subtitle,
  image
}: { name: string; subtitle: string; image: string }) {
  return (
    <SiteLink className={`league-card ${image}`} href="/ligas">
      <img src={brandAssets[image]} alt="" loading="lazy" />
      <span className="meta">{subtitle}</span>
      <h3>{name}</h3>
      <p>
        {image === 'premier'
          ? 'La máxima categoría de RCL. Los equipos se disputan la corona temporada tras temporada.'
          : 'La cantera competitiva de RCL. El siguiente capítulo del camino hacia la corona.'}
      </p>
      <span className="text-link">Ver ligas →</span>
    </SiteLink>
  );
}
