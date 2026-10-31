import type { EditorialArticle } from '@rcl/contracts';
import React, { useEffect, useId, useState } from 'react';
import { ContentStatus } from '../../../../../features/home-content/components/ContentStatus.js';
import { useHomeContent } from '../../../../../features/home-content/useHomeContent.js';
import { SiteLink } from '../../../../../shared/components/SiteLink.js';

export function circularNewsIndex(index: number, count: number): number {
  return count > 0 ? ((index % count) + count) % count : 0;
}

function SecondaryNews({ articles }: { articles: EditorialArticle[] }) {
  const listId = useId();
  const [start, setStart] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false)
  );
  const rotating = articles.length > 3;
  const automatic = rotating && !paused && !hovered && !focused && !reducedMotion;

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!automatic) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setStart((value) => circularNewsIndex(value + 1, articles.length));
    }, 6000);
    return () => window.clearInterval(timer);
  }, [automatic, articles.length]);

  const move = (direction: number) => {
    setPaused(true);
    setStart((value) => circularNewsIndex(value + direction, articles.length));
  };

  return (
    <section
      className="news-side"
      aria-label="Mas noticias"
      aria-roledescription={rotating ? 'carrusel' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="news-side-heading">
        <span className="meta">Mas en la rebelion</span>
        <span className="news-count">
          {String(articles.length).padStart(2, '0')}{' '}
          {articles.length === 1 ? 'noticia' : 'noticias'}
        </span>
      </div>
      <div className="news-list" id={listId} aria-live={automatic ? 'off' : 'polite'}>
        {Array.from({ length: Math.min(3, articles.length) }, (_, offset) => {
          const index = circularNewsIndex(start + offset, articles.length);
          const article = articles[index];
          if (!article) return null;
          return (
            <SiteLink className="news-item" href={`/editorial/${article.id}`} key={article.id}>
              <span className="news-number">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <span className="meta">{article.kind}</span>
                <h3>{article.title}</h3>
                <span className="news-item-author">{article.author}</span>
              </div>
              <span className="news-item-arrow" aria-hidden="true">
                ↗
              </span>
            </SiteLink>
          );
        })}
      </div>
      {rotating && (
        <div className="news-controls">
          <div className="news-control-buttons">
            <button
              className="news-control news-arrow"
              type="button"
              aria-label="Noticias anteriores"
              title="Noticias anteriores"
              aria-controls={listId}
              onClick={() => move(-1)}
            >
              <span aria-hidden="true">←</span>
            </button>
            <span
              className="news-position"
              aria-label={`Primera noticia visible: ${start + 1} de ${articles.length}`}
            >
              <strong>{String(start + 1).padStart(2, '0')}</strong>
              <span aria-hidden="true">/</span>
              {String(articles.length).padStart(2, '0')}
            </span>
            {!reducedMotion && (
              <button
                className="news-control news-pause"
                type="button"
                onClick={() => setPaused((value) => !value)}
                aria-controls={listId}
                aria-label="Pausar rotacion automatica"
                aria-pressed={paused}
                title={paused ? 'Reanudar rotacion automatica' : 'Pausar rotacion automatica'}
              >
                <span
                  className={paused ? 'news-play-icon' : 'news-pause-icon'}
                  aria-hidden="true"
                />
              </button>
            )}
            <button
              className="news-control news-arrow"
              type="button"
              aria-label="Noticias siguientes"
              title="Noticias siguientes"
              aria-controls={listId}
              onClick={() => move(1)}
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function EditorialGrid() {
  const content = useHomeContent<EditorialArticle[]>('articles');
  const [featured, ...articles] = content.data ?? [];
  return (
    <section className="section news-section" aria-label="Editorial">
      <div className="eyebrow">Editorial · Cronica de la Rebelion</div>
      <ContentStatus {...content} />
      {!content.loading && !content.error && !featured && (
        <article className="news-hero">
          <span className="news-tag">La comunidad</span>
          <div>
            <h2>Las historias de nuestra liga.</h2>
            <p>Pronto encontraras aqui noticias, reportajes y entrevistas de RCL.</p>
            <span className="meta">Proximamente · Cronicas de la liga</span>
          </div>
        </article>
      )}
      {featured && (
        <div className={`news-grid${articles.length ? '' : ' news-grid-solo'}`}>
          <SiteLink className="news-hero news-hero-link" href={`/editorial/${featured.id}`}>
            {featured.coverUrl && (
              <img
                className="news-hero-cover"
                src={featured.coverUrl}
                alt={featured.coverAlt}
                loading="lazy"
              />
            )}
            <div className="news-hero-top">
              <span className="news-tag">{featured.kind}</span>
              <span className="news-featured-label">En portada</span>
            </div>
            <div>
              <h2>{featured.title}</h2>
              <p>{featured.excerpt}</p>
              <div className="news-hero-footer">
                <span className="meta">{featured.author}</span>
                <span className="news-read">
                  Leer historia <span aria-hidden="true">↗</span>
                </span>
              </div>
            </div>
          </SiteLink>
          {articles.length > 0 && (
            <SecondaryNews
              key={articles.map((article) => article.id).join(',')}
              articles={articles}
            />
          )}
        </div>
      )}
    </section>
  );
}
