import React from 'react';
import type { Division } from '../../../features/competition/types/competition.types.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { brandAssets } from '../../../shared/resources/assets.js';

export interface LeagueDivisionGridProps {
  divisions: Division[];
  seasonName?: string | undefined;
  onSelectDivision: (divisionId: string) => void;
}

export function LeagueDivisionGrid({
  divisions,
  seasonName,
  onSelectDivision
}: LeagueDivisionGridProps) {
  return (
    <div className="league-grid">
      {divisions.map((division, index) => (
        <article
          className={`league-card ${index % 2 === 0 ? 'premier' : 'ascend'}`}
          key={division.id}
        >
          <img src={brandAssets[index % 2 === 0 ? 'premier' : 'ascend']} alt="" loading="lazy" />
          <span className="meta">{seasonName}</span>
          <h3>{division.name}</h3>
          <p>Consulta los equipos, las jornadas y la clasificación de esta división.</p>
          <SiteLink
            className="btn-ghost"
            href="/clasificacion"
            onClick={() => onSelectDivision(division.id)}
          >
            Ver clasificación →
          </SiteLink>
        </article>
      ))}
    </div>
  );
}
