import type { EditorialArticle } from '@rcl/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useHomeContent } from '../../../apps/web/src/features/home-content/useHomeContent.js';
import { EditorialGrid } from '../../../apps/web/src/site/pages/home/components/EditorialGrid/EditorialGrid.js';

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
