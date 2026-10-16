import React, { useEffect, useState } from 'react';
import { MatchCard } from '../../../../../features/competition/components/MatchCard.js';
import type { Match } from '../../../../../features/competition/types/competition.types.js';
import { SiteLink } from '../../../../../shared/components/SiteLink.js';

export function HomeFeaturedMatch({
  featured,
  liveMatches = []
}: { featured?: Match | undefined; liveMatches?: Match[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const matchCount = liveMatches.length;
  const visibleIndex = matchCount > 0 ? activeIndex % matchCount : 0;
  const isCarousel = liveMatches.length > 1;

  useEffect(() => {
    if (!isCarousel || hovered || focused || paused) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let interval: number | undefined;
    const updateRotation = () => {
      window.clearInterval(interval);
      if (!preference.matches) {
        interval = window.setInterval(() => {
          setActiveIndex((index) => (index + 1) % matchCount);
        }, 10_000);
      }
    };
    updateRotation();
    preference.addEventListener('change', updateRotation);
    return () => {
      window.clearInterval(interval);
      preference.removeEventListener('change', updateRotation);
    };
  }, [isCarousel, matchCount, hovered, focused, paused]);
  return (
    <div
      className="featured-match"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
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
          <div className="featured-match-controls">
            <button
              type="button"
              onClick={() => setActiveIndex((visibleIndex + matchCount - 1) % matchCount)}
            >
              Partido anterior
            </button>
            <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
              Pausar rotación automática
            </button>
            <button type="button" onClick={() => setActiveIndex((visibleIndex + 1) % matchCount)}>
              Partido siguiente
            </button>
          </div>
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
