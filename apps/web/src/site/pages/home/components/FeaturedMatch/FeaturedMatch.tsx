import React, { useEffect, useState } from 'react';
import { MatchCard } from '../../../../../features/competition/components/MatchCard.js';
import type { Match } from '../../../../../features/competition/types/competition.types.js';
import { SiteLink } from '../../../../../shared/components/SiteLink.js';

export function HomeFeaturedMatch({
  featured,
  liveMatches = []
}: { featured?: Match | undefined; liveMatches?: Match[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const matchCount = liveMatches.length;
  const visibleIndex = matchCount > 0 ? activeIndex % matchCount : 0;
  const isCarousel = liveMatches.length > 1;

  useEffect(() => {
    if (!isCarousel) return;
    const interval = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % matchCount);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [isCarousel, matchCount]);
  return (
    <div className="featured-match">
      <div className="featured-match-heading">
        <span className="eyebrow">
          {liveMatches.length > 0 || featured?.status === 'live'
            ? 'En directo'
            : 'Próximo encuentro'}
        </span>
        {isCarousel && (
          <div className="featured-match-count">
            <span>{liveMatches.length} partidos en directo</span>
          </div>
        )}
      </div>
      {isCarousel ? (
        <section aria-label="Partidos en directo" aria-roledescription="carrusel">
          <div className="featured-match-track">
            {liveMatches.map((match, index) => (
              <section
                className={`featured-match-slide${index === visibleIndex ? ' is-active' : ''}`}
                key={match.id}
                inert={index !== visibleIndex}
                aria-hidden={index !== visibleIndex}
                aria-roledescription="diapositiva"
                aria-label={`${index + 1} de ${liveMatches.length}`}
              >
                <MatchCard match={match} />
              </section>
            ))}
          </div>
        </section>
      ) : featured ? (
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
