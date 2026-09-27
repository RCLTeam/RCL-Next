import type { EditorialInput } from '@rcl/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ArticleView } from './ArticleView.js';

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
