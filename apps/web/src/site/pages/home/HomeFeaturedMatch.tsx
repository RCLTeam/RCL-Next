import React from 'react';
import { MatchCard } from '../../../features/competition/components/MatchCard.js';
import type { Match } from '../../../features/competition/types/competition.types.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';

export function HomeFeaturedMatch({ featured }: { featured?: Match | undefined }) {
  return (
    <div className="featured-match">
      <span className="eyebrow">
        {featured?.status === 'live' ? 'En directo' : 'Próximo encuentro'}
      </span>
      {featured ? (
        <MatchCard match={featured} />
      ) : (
        <div className="featured-empty">
          <span>Consulta las jornadas y los resultados de la competición.</span>
          <SiteLink href="/calendario" className="text-link">
            Ir al calendario →
          </SiteLink>
        </div>
      )}
    </div>
  );
}
