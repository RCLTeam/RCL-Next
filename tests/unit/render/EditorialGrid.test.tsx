import type { EditorialArticle } from '@rcl/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { useHomeContent } from '../../../apps/web/src/features/home-content/useHomeContent.js';
import {
  EditorialGrid,
  circularNewsIndex
} from '../../../apps/web/src/site/pages/home/components/EditorialGrid/EditorialGrid.js';

vi.mock('../../../apps/web/src/features/home-content/useHomeContent.js');

function renderNews(count: number) {
  const data: EditorialArticle[] = Array.from({ length: count }, (_, index) => ({
    id: `article-${index}`,
    title: `Story ${index}`,
    excerpt: 'Summary',
    body: '',
    kind: 'noticia',
    author: 'RCL',
    coverUrl: '',
    coverAlt: '',
    published: true,
    showOnHome: true,
    homeOrder: index,
    publishedAt: null,
    updatedAt: ''
  }));
  vi.mocked(useHomeContent).mockReturnValue({
    data,
    loading: false,
    error: undefined,
    retry: vi.fn()
  });
  return renderToStaticMarkup(<EditorialGrid />);
}

describe('Home editorial', () => {
  it('keeps the featured story and limits secondary stories to three', () => {
    const html = renderNews(8);
    expect(html.match(/class="news-item"/g)).toHaveLength(3);
    expect(html).toContain('Story 0');
    expect(html).toContain('Story 3');
    expect(html).not.toContain('Story 4');
    expect(html).toContain('Noticias anteriores');
    expect(html).toContain('Noticias siguientes');
    expect(html).toContain('Pausar rotación automática');
  });
  it.each([1, 2, 3, 4])('omits carousel controls for %i total stories', (count) => {
    const html = renderNews(count);
    expect(html.match(/class="news-item"/g) ?? []).toHaveLength(count - 1);
    expect(html).not.toContain('Noticias siguientes');
    expect(html).toContain('Story 0');
  });
  it('shows the empty state without a carousel', () => {
    const html = renderNews(0);
    expect(html).toContain('Pronto encontrarás');
    expect(html).not.toContain('Noticias siguientes');
  });
});

describe('Editorial carousel edge cases', () => {
  it('uses the full-width layout for a single article', () => {
    const html = renderNews(1);
    expect(html).toContain('news-grid news-grid-solo');
    expect(html).not.toContain('class="news-side"');
    expect(renderNews(2)).not.toContain('news-grid-solo');
  });

  it('keeps manual controls and polite announcements with reduced motion', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('window', { matchMedia });
    onTestFinished(() => vi.unstubAllGlobals());
    const html = renderNews(6);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('Pausar rotación automática');
    expect(html).toContain('Noticias anteriores');
    expect(html).toContain('Noticias siguientes');
    expect(html.match(/class="news-item"/g)).toHaveLength(3);
  });

  it.each([{}, { matchMedia: () => ({ matches: false }) }])(
    'renders with a partial window or unrestricted motion',
    (windowDouble) => {
      vi.stubGlobal('window', windowDouble);
      onTestFinished(() => vi.unstubAllGlobals());
      const html = renderNews(6);
      expect(html).toContain('aria-live="off"');
      expect(html).toContain('Pausar rotación automática');
    }
  );

  it.each([
    [4, 4, 0],
    [-1, 4, 3],
    [2, 4, 2],
    [9, 4, 1],
    [-9, 4, 3],
    [1, 1, 0],
    [1, 0, 0]
  ])('wraps index %i for %i secondary stories to %i', (index, count, expected) => {
    expect(circularNewsIndex(index, count)).toBe(expected);
  });

  it('wraps the three visible slots without repeating a secondary story', () => {
    const indices = [0, 1, 2].map((offset) => circularNewsIndex(3 + offset, 4));
    expect(indices).toEqual([3, 0, 1]);
    expect(new Set(indices).size).toBe(3);
  });
});
