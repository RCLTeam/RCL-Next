import React from 'react';
import type { Division } from '../../../features/competition/types/competition.types.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { brandAssets } from '../../../shared/resources/assets.js';

export interface LeagueDivisionGridProps {
  divisions: Division[];
  seasonName?: string | undefined;
  onSelectDivision: (divisionId: string) => void;
}

function LeagueFormatCard({
  division,
  seasonName,
  onSelectDivision
}: {
  division: Division;
  seasonName?: string | undefined;
  onSelectDivision: (divisionId: string) => void;
}) {
  const name = division.code.trim().toLowerCase();
  const brand = /^ascend\b/.test(name) ? 'ascend' : 'premier';
  const videoId = brand === 'ascend' ? '4NpDE3v1k-g' : 'WtXUe4SUu-g';
  const source = /^(premier|ascend)\b/.test(name)
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : undefined;
  return (
    <article className={`league-card league-format-card ${brand}`}>
      <div className="league-card-copy">
        <span className="meta">{seasonName}</span>
        <div className="league-card-title">
          <h3>{division.name}</h3>
          <img className="league-card-crown" src={brandAssets[brand]} alt="" loading="lazy" />
        </div>
        <p>Consulta los equipos, las jornadas y la clasificación de esta división.</p>
        <div className="league-card-actions">
          <SiteLink
            className="btn-ghost"
            href="/clasificacion"
            onClick={() => onSelectDivision(division.id)}
          >
            Ver clasificación
          </SiteLink>
        </div>
      </div>
      {source && (
        <div className="league-format">
          <iframe
            className="league-format-video"
            src={source}
            title={`Vídeo del formato de ${division.name}`}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
    </article>
  );
}

export function LeagueDivisionGrid({
  divisions,
  seasonName,
  onSelectDivision
}: LeagueDivisionGridProps) {
  return (
    <div className="league-grid league-format-grid">
      {divisions.map((division) => (
        <LeagueFormatCard
          key={division.id}
          division={division}
          seasonName={seasonName}
          onSelectDivision={onSelectDivision}
        />
      ))}
    </div>
  );
}
