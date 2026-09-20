import React from 'react';
import { SiteLink } from '../../../shared/components/SiteLink.js';

export interface HomeHeroProps {
  seasonName?: string | undefined;
  streamUrl?: string | null | undefined;
}

export function HomeHero({ seasonName, streamUrl }: HomeHeroProps) {
  return (
    <div className="hero">
      <div className="hero-bg" aria-hidden="true" />
      <div className="hero-frame" aria-hidden="true" />
      <div className="hero-body">
        <div className="hero-kicker">
          <span className="status-dot" />
          {seasonName ?? 'REBEL CROWN LEGACY · THE REBELLION'}
        </div>
        <h1>
          LA CORONA
          <br />
          NO SE <em>HEREDA</em>
        </h1>
        <p>
          Una liga construida por rebeldes. Cada equipo lucha por dejar su marca y tomar la corona —
          no es solo un torneo, es una rebelión.
        </p>
        <div className="btn-row">
          {streamUrl ? (
            <a className="btn-primary" href={streamUrl} target="_blank" rel="noreferrer">
              Ver en directo <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <SiteLink className="btn-primary" href="/ligas">
              Descubre las ligas <span aria-hidden="true">↗</span>
            </SiteLink>
          )}
          <SiteLink className="btn-ghost" href="/calendario">
            Ver calendario completo
          </SiteLink>
        </div>
      </div>
      <div className="hero-ticker" aria-hidden="true">
        <div className="hero-ticker-track">
          {[0, 1].map((copy) => (
            <span key={copy}>
              THE REBELLION · LA CORONA NO SE HEREDA, SE CONQUISTA · THE REBELLION · LA CORONA NO SE
              HEREDA, SE CONQUISTA ·&nbsp;
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
