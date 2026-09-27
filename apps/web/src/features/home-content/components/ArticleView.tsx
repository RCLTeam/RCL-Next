import type { EditorialInput } from '@rcl/contracts';
import React from 'react';
import './editorial.css';

export function ArticleView({
  article,
  publishedAt
}: { article: EditorialInput; publishedAt?: string | null | undefined }) {
  const minutes = Math.max(1, Math.ceil(article.body.split(/\s+/).length / 220));
  return (
    <article className="editorial-article">
      <header className="editorial-header">
        <span className="eyebrow">Editorial · Crónica de la Rebelión</span>
        <span className="news-tag">{article.kind === 'otro' ? 'Otro tema' : article.kind}</span>
        <h1>{article.title}</h1>
        {article.excerpt && <p className="editorial-excerpt">{article.excerpt}</p>}
        <div className="editorial-byline">
          <span>Por {article.author}</span>
          {publishedAt && (
            <time dateTime={publishedAt}>
              {new Date(publishedAt).toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </time>
          )}
          <span>{minutes} min de lectura</span>
        </div>
      </header>
      {article.coverUrl && (
        <figure className="editorial-cover">
          <img src={article.coverUrl} alt={article.coverAlt} />
          <figcaption>{article.coverAlt}</figcaption>
        </figure>
      )}
      <div className="editorial-body">
        {article.body.split(/\n\s*\n/).map((paragraph, index) => {
          // Content is rendered as text, never interpreted as HTML.
          const key = `${index}-${paragraph.slice(0, 20)}`;
          const image =
            /^!\[([^\]\n]+)\]\((\/api\/v1\/home-content\/images\/[a-f0-9-]{36}\.(?:png|jpg|webp))\)$/.exec(
              paragraph.trim()
            );
          if (image)
            return (
              <figure className="editorial-inline-image" key={key}>
                <img src={image[2]} alt={image[1]} loading="lazy" />
                <figcaption>{image[1]}</figcaption>
              </figure>
            );
          if (paragraph.startsWith('## ')) return <h2 key={key}>{paragraph.slice(3)}</h2>;
          if (paragraph.startsWith('> '))
            return <blockquote key={key}>{paragraph.slice(2)}</blockquote>;
          return <p key={key}>{paragraph}</p>;
        })}
      </div>
      <footer className="editorial-footer">
        <span className="eyebrow">Rebel Crown Legacy</span>
        <p>Las historias que construyen nuestro legado.</p>
      </footer>
    </article>
  );
}
