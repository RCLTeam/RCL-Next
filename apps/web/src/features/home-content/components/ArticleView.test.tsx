import type { EditorialInput } from '@rcl/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { ArticleView } from './ArticleView.js';

const processTimeZone = process.env.TZ;
// Render as a visitor outside the league's time zone.
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (processTimeZone === undefined) Reflect.deleteProperty(process.env, 'TZ');
  else process.env.TZ = processTimeZone;
});

const article: EditorialInput = {
  title: 'Final',
  excerpt: '',
  author: 'RCL',
  kind: 'noticia',
  body: '',
  coverUrl: '',
  coverAlt: '',
  published: true,
  showOnHome: true,
  homeOrder: 0
};

test('renders uploaded images between article paragraphs with descriptions', () => {
  const url = '/api/v1/home-content/images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
  const html = renderToStaticMarkup(
    <ArticleView article={{ ...article, body: `Inicio.\n\n![La final](${url})\n\nFin.` }} />
  );
  expect(html).toContain(`src="${url}"`);
  expect(html).toContain('alt="La final"');
  expect(html).toContain('<figcaption>La final</figcaption>');
  expect(html.indexOf('Inicio.')).toBeLessThan(html.indexOf('<figure'));
  expect(html.indexOf('</figure>')).toBeLessThan(html.indexOf('Fin.'));
});

test('treats HTML and unsupported image URLs as text', () => {
  const html = renderToStaticMarkup(
    <ArticleView
      article={{
        ...article,
        body: '<script>alert(1)</script>\n\n![Unsafe](javascript:alert(1))\n\n![Remote](https://example.com/image.png)'
      }}
    />
  );
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;script&gt;');
});

test('shows the publication date in Madrid time, not the browser time zone', () => {
  // 22:30 UTC on 4 October is already 5 October in Madrid but still 4 October in New York.
  const publishedAt = '2026-10-04T22:30:00Z';
  const html = renderToStaticMarkup(<ArticleView article={article} publishedAt={publishedAt} />);
  expect(html).toContain(`<time dateTime="${publishedAt}">5 de octubre de 2026</time>`);
});
