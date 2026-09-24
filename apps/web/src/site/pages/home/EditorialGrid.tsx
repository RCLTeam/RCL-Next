import type { EditorialArticle } from '@rcl/contracts';
import React from 'react';
import { ContentStatus } from '../../../features/home-content/components/ContentStatus.js';
import { useHomeContent } from '../../../features/home-content/useHomeContent.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';

export function EditorialGrid() {
  const content = useHomeContent<EditorialArticle[]>('articles');
  const [featured, ...articles] = content.data ?? [];
  return (
    <section className="section" aria-label="Editorial">
      <div className="eyebrow">Editorial · Crónica de la Rebelión</div>
      <ContentStatus {...content} />
      {!content.loading && !content.error && !featured && (
        <article className="news-hero">
          <span className="news-tag">La comunidad</span>
          <div>
            <h2>Las historias de nuestra liga.</h2>
            <p>Pronto encontrarás aquí noticias, reportajes y entrevistas de RCL.</p>
            <span className="meta">Próximamente · Crónicas de la liga</span>
          </div>
        </article>
      )}
      {featured && (
        <div className="news-grid">
          <SiteLink className="news-hero news-hero-link" href={`/editorial/${featured.id}`}>
            <span className="news-tag">{featured.kind}</span>
            {featured.coverUrl && (
              <img
                className="news-hero-cover"
                src={featured.coverUrl}
                alt={featured.coverAlt}
                loading="lazy"
              />
            )}
            <div>
              <h2>{featured.title}</h2>
              <p>{featured.excerpt}</p>
              <span className="meta">{featured.author} · Leer historia →</span>
            </div>
          </SiteLink>
          {articles.length > 0 && (
            <div className="news-side">
              {articles.map((article, index) => (
                <SiteLink className="news-item" href={`/editorial/${article.id}`} key={article.id}>
                  <span className="news-number">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <span className="meta">{article.kind}</span>
                    <h3>{article.title}</h3>
                    <span className="text-link">Leer historia →</span>
                  </div>
                </SiteLink>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
