import { expect, test } from 'vitest';
import { getPageMetadata, pageMetadata, renderPageMetadata } from './page-metadata.js';

test('Public sections have distinct descriptions and normalize query strings and trailing slashes', () => {
  const descriptions = Object.values(pageMetadata).map((page) => page.description);
  expect(new Set(descriptions).size).toBe(descriptions.length);
  expect(getPageMetadata('/equipos/?division=1')).toEqual(pageMetadata['/equipos']);
  expect(getPageMetadata('/unknown').title).toBe('Página no encontrada');
  expect(getPageMetadata('/toString').title).toBe('Página no encontrada');
});

test('HTML metadata escapes attribute values and replaces previous tags without duplication', () => {
  const template =
    '<head><!-- page-metadata:start --><title>Old</title><!-- page-metadata:end --></head>';
  const metadata = { title: 'A & B', description: '"/><script>alert(1)</script> $&' };
  const html = renderPageMetadata(template, metadata);
  expect(html).toContain('A &amp; B');
  expect(html).toContain('&quot;/&gt;&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('og:description');
  expect(html).toContain('twitter:description');
  expect(renderPageMetadata(html, metadata)).toBe(html);
});
