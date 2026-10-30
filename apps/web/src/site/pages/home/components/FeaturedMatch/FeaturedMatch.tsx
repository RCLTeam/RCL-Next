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
  const singleMatch = featured ?? liveMatches[0];
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
          {isCarousel || singleMatch?.status === 'live' ? 'En directo' : 'Proximo encuentro'}
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
          <div className="featured-match-navigation">
            <div className="featured-match-controls">
              <button
                className="featured-match-control featured-match-arrow"
                type="button"
                aria-label="Partido anterior"
                title="Partido anterior"
                onClick={() => setActiveIndex((visibleIndex + matchCount - 1) % matchCount)}
              >
                <span aria-hidden="true">←</span>
              </button>
              <span
                className="featured-match-position"
                aria-label={`Partido ${visibleIndex + 1} de ${matchCount}`}
              >
                <strong>{String(visibleIndex + 1).padStart(2, '0')}</strong>
                <span aria-hidden="true">/</span>
                {String(matchCount).padStart(2, '0')}
              </span>
              <button
                className="featured-match-control featured-match-pause"
                type="button"
                aria-label="Pausar rotacion automatica"
                aria-pressed={paused}
                title={paused ? 'Reanudar rotacion automatica' : 'Pausar rotacion automatica'}
                onClick={() => setPaused(!paused)}
              >
                <span
                  className={paused ? 'featured-match-play-icon' : 'featured-match-pause-icon'}
                  aria-hidden="true"
                />
              </button>
              <button
                className="featured-match-control featured-match-arrow"
                type="button"
                aria-label="Partido siguiente"
                title="Partido siguiente"
                onClick={() => setActiveIndex((visibleIndex + 1) % matchCount)}
              >
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </section>
      ) : singleMatch ? (
        <MatchCard match={singleMatch} />
      ) : (
        <div className="featured-empty">
          <span>Consulta las jornadas y los resultados de la competicion.</span>
          <SiteLink href="/calendario" className="text-link">
            Ir al calendario →
          </SiteLink>
        </div>
      )}
    </div>
  );
}
