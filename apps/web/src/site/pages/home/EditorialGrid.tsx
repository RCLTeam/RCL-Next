import React from 'react';
import { SiteLink } from '../../../shared/components/SiteLink.js';

const newsLinks = [
  ['01', 'Competición', 'Sigue el camino de cada equipo', '/clasificacion'],
  ['02', 'Protagonistas', 'Conoce a los equipos de la rebelión', '/equipos'],
  ['03', 'Fantasy', 'Tu quinteto. Tu estrategia.', '/fantasy']
] as const;

export function EditorialGrid() {
  return (
    <div className="section">
      <div className="eyebrow">Editorial · Crónica de la Rebelión</div>
      <div className="news-grid">
        <article className="news-hero">
          <span className="news-tag">La comunidad</span>
          <div>
            <h2>
              Tu próxima historia
              <br />
              empieza en la grieta.
            </h2>
            <p>Resultados, protagonistas y momentos que construyen el legado de RCL.</p>
            <span className="meta">Próximamente · Crónicas de la liga</span>
          </div>
        </article>
        <div className="news-side">
          {newsLinks.map(([number, tag, title, href]) => (
            <SiteLink className="news-item" href={href} key={number}>
              <span className="news-number">{number}</span>
              <div>
                <span className="meta">{tag}</span>
                <h3>{title}</h3>
                <span className="text-link">Explorar →</span>
              </div>
            </SiteLink>
          ))}
        </div>
      </div>
    </div>
  );
}
