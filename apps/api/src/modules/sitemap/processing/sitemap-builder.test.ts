import { describe, expect, it } from 'vitest';
import type { SitemapUrlEntry } from '../types/sitemap.types.js';
import { buildSitemapXml, escapeXml, formatSitemapDate } from './sitemap-builder.js';

describe('escapeXml', () => {
  it('escapes ampersand (&) to &amp;', () => {
    expect(escapeXml('https://example.com?a=1&b=2')).toBe('https://example.com?a=1&amp;b=2');
  });

  it('escapes less-than (<) to &lt; and greater-than (>) to &gt;', () => {
    expect(escapeXml('<div>test</div>')).toBe('&lt;div&gt;test&lt;/div&gt;');
  });

  it('escapes double quotes (") to &quot; and single quotes (\') to &apos;', () => {
    expect(escapeXml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &apos;world&apos;');
  });

  it('handles strings with all special XML characters', () => {
    expect(escapeXml('<tag attr="val" alt=\'x\'>A & B</tag>')).toBe(
      '&lt;tag attr=&quot;val&quot; alt=&apos;x&apos;&gt;A &amp; B&lt;/tag&gt;'
    );
  });

  it('returns empty string when given empty string', () => {
    expect(escapeXml('')).toBe('');
  });

  it('leaves clean strings unchanged', () => {
    expect(escapeXml('https://rebelcrownlegacy.es/calendario')).toBe(
      'https://rebelcrownlegacy.es/calendario'
    );
  });
});

describe('formatSitemapDate', () => {
  it('formats valid Date to ISO 8601 YYYY-MM-DD string', () => {
    const date = new Date('2026-10-03T14:30:00.000Z');
    expect(formatSitemapDate(date)).toBe('2026-10-03');
  });

  it('formats dates consistently in UTC', () => {
    const date = new Date(Date.UTC(2025, 0, 15, 23, 59, 59));
    expect(formatSitemapDate(date)).toBe('2025-01-15');
  });

  it('throws RangeError for invalid Date', () => {
    const invalidDate = new Date('invalid-date-string');
    expect(() => formatSitemapDate(invalidDate)).toThrow(RangeError);
  });
});

describe('buildSitemapXml', () => {
  it('generates valid empty urlset when urls array is empty', () => {
    const xml = buildSitemapXml([]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('</urlset>');
    expect(xml).not.toContain('<url>');
  });

  it('generates a single URL entry with only required loc field', () => {
    const urls: SitemapUrlEntry[] = [{ loc: 'https://rebelcrownlegacy.es/' }];
    const xml = buildSitemapXml(urls);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<url>');
    expect(xml).toContain('<loc>https://rebelcrownlegacy.es/</loc>');
    expect(xml).toContain('</url>');
    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('<changefreq>');
    expect(xml).not.toContain('<priority>');
  });

  it('escapes special characters in loc', () => {
    const urls: SitemapUrlEntry[] = [
      { loc: 'https://rebelcrownlegacy.es/search?tag=lol&sort=asc' }
    ];
    const xml = buildSitemapXml(urls);
    expect(xml).toContain('<loc>https://rebelcrownlegacy.es/search?tag=lol&amp;sort=asc</loc>');
  });

  it('includes optional fields: lastmod, changefreq, and priority formatted to 1 decimal', () => {
    const urls: SitemapUrlEntry[] = [
      {
        loc: 'https://rebelcrownlegacy.es/calendario',
        lastmod: '2026-10-03',
        changefreq: 'daily',
        priority: 0.9
      }
    ];
    const xml = buildSitemapXml(urls);
    expect(xml).toContain('<loc>https://rebelcrownlegacy.es/calendario</loc>');
    expect(xml).toContain('<lastmod>2026-10-03</lastmod>');
    expect(xml).toContain('<changefreq>daily</changefreq>');
    expect(xml).toContain('<priority>0.9</priority>');
  });

  it('formats priority with 1 decimal place even for integer values like 1 or 0', () => {
    const urls: SitemapUrlEntry[] = [
      { loc: 'https://rebelcrownlegacy.es/', priority: 1 },
      { loc: 'https://rebelcrownlegacy.es/archive', priority: 0 }
    ];
    const xml = buildSitemapXml(urls);
    expect(xml).toContain('<priority>1.0</priority>');
    expect(xml).toContain('<priority>0.0</priority>');
  });

  it('clamps priority to bounds [0.0, 1.0] when out of range', () => {
    const urls: SitemapUrlEntry[] = [
      { loc: 'https://rebelcrownlegacy.es/over', priority: 1.5 },
      { loc: 'https://rebelcrownlegacy.es/under', priority: -0.5 }
    ];
    const xml = buildSitemapXml(urls);
    expect(xml).toContain('<priority>1.0</priority>');
    expect(xml).toContain('<priority>0.0</priority>');
  });

  it('omits priority if NaN', () => {
    const urls: SitemapUrlEntry[] = [
      { loc: 'https://rebelcrownlegacy.es/nan', priority: Number.NaN }
    ];
    const xml = buildSitemapXml(urls);
    expect(xml).not.toContain('<priority>');
  });

  it('renders multiple URL entries in correct order and structure', () => {
    const urls: SitemapUrlEntry[] = [
      { loc: 'https://rebelcrownlegacy.es/', priority: 1.0, changefreq: 'daily' },
      { loc: 'https://rebelcrownlegacy.es/calendario', priority: 0.9, changefreq: 'daily' },
      {
        loc: 'https://rebelcrownlegacy.es/equipos/team-alpha',
        priority: 0.7,
        changefreq: 'weekly',
        lastmod: '2026-10-02'
      }
    ];
    const xml = buildSitemapXml(urls);
    const urlMatches = xml.match(/<url>/g);
    expect(urlMatches).toHaveLength(3);

    const firstIndex = xml.indexOf('https://rebelcrownlegacy.es/');
    const secondIndex = xml.indexOf('https://rebelcrownlegacy.es/calendario');
    const thirdIndex = xml.indexOf('https://rebelcrownlegacy.es/equipos/team-alpha');
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(secondIndex).toBeLessThan(thirdIndex);
  });
});
