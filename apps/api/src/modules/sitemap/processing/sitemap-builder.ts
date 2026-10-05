import type { SitemapUrlEntry } from '../types/sitemap.types.js';

/**
 * Escapes XML special characters according to the XML 1.0 standard.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats a JavaScript Date into ISO 8601 YYYY-MM-DD representation.
 */
export function formatSitemapDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid date provided to formatSitemapDate');
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Builds a standard sitemap 0.9 XML string from a list of URL entries.
 * Pure function with zero side effects.
 */
export function buildSitemapXml(urls: SitemapUrlEntry[]): string {
  const urlNodes = urls.map((entry) => {
    const lines = ['  <url>', `    <loc>${escapeXml(entry.loc)}</loc>`];

    if (entry.lastmod) {
      lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    }

    if (entry.changefreq) {
      lines.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`);
    }

    if (typeof entry.priority === 'number' && !Number.isNaN(entry.priority)) {
      const clamped = Math.max(0.0, Math.min(1.0, entry.priority));
      lines.push(`    <priority>${clamped.toFixed(1)}</priority>`);
    }

    lines.push('  </url>');
    return lines.join('\n');
  });

  if (urlNodes.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>';
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlNodes.join('\n')}\n</urlset>`;
}
