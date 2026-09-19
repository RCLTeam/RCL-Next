import React, { type ReactNode } from 'react';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { brandAssets } from '../../../shared/resources/assets.js';

export interface DivisionCardProps {
  name: string;
  subtitle: string;
  image: string;
  onClick?: (() => void) | undefined;
  active?: boolean | undefined;
  href?: string | undefined;
  description?: string | undefined;
  children?: ReactNode;
}

export function DivisionCard({
  name,
  subtitle,
  image,
  onClick,
  active,
  href,
  description,
  children
}: DivisionCardProps) {
  const resolvedImage = brandAssets[image] ?? image;
  const defaultDescription =
    image === 'premier'
      ? 'La máxima categoría de RCL. Los equipos se disputan la corona temporada tras temporada.'
      : 'La cantera competitiva de RCL. El siguiente capítulo del camino hacia la corona.';

  const cardClass = ['league-card', active ? 'is-active' : '', image].filter(Boolean).join(' ');

  const content = (
    <>
      <img src={resolvedImage} alt="" loading="lazy" />
      <span className="meta">{subtitle}</span>
      <h3>{name}</h3>
      <p>{description ?? defaultDescription}</p>
      {children ?? <span className="text-link">Ver ligas →</span>}
    </>
  );

  if (onClick && !href) {
    return (
      <button type="button" className={cardClass} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <SiteLink href={href ?? '/ligas'} className={cardClass} onClick={onClick}>
      {content}
    </SiteLink>
  );
}
