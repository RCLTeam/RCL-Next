import type { SitemapRepository } from '../persistence/sitemap.repository.js';
import type { SitemapChangeFrequency, SitemapUrlEntry } from '../types/sitemap.types.js';
import { buildSitemapXml, formatSitemapDate } from './sitemap-builder.js';

export const DEFAULT_SITEMAP_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 43,200,000 ms (12 hours)

export interface SitemapServiceOptions {
  baseUrl?: string;
  cacheTtlMs?: number;
}

interface StaticRouteDefinition {
  path: string;
  priority: number;
  changefreq: SitemapChangeFrequency;
}

const STATIC_ROUTES: readonly StaticRouteDefinition[] = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/calendario', priority: 0.9, changefreq: 'daily' },
  { path: '/clasificacion', priority: 0.9, changefreq: 'daily' },
  { path: '/predicciones', priority: 0.8, changefreq: 'weekly' },
  { path: '/equipos', priority: 0.8, changefreq: 'weekly' },
  { path: '/jugadores', priority: 0.8, changefreq: 'weekly' },
  { path: '/ligas', priority: 0.7, changefreq: 'weekly' },
  { path: '/playoffs', priority: 0.7, changefreq: 'weekly' },
  { path: '/champions', priority: 0.6, changefreq: 'weekly' },
  { path: '/crystal-ball', priority: 0.6, changefreq: 'weekly' }
] as const;

export class SitemapService {
  private readonly cacheTtlMs: number;
  private cachedXml: string | null = null;
  private cachedAt: number | null = null;
  private inFlightPromise: Promise<string> | null = null;

  constructor(
    private readonly repository: SitemapRepository,
    private readonly options?: SitemapServiceOptions
  ) {
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_SITEMAP_CACHE_TTL_MS;
  }

  /**
   * Resolves the canonical base URL without trailing slashes.
   */
  private getBaseUrl(): string {
    const envUrl = process.env.FRONTEND_URL;
    const candidate =
      this.options?.baseUrl ?? (envUrl && envUrl !== 'undefined' ? envUrl : undefined);
    const raw = candidate?.trim() || 'https://rebelcrownlegacy.es';
    return raw.replace(/\/+$/, '');
  }

  /**
   * Generates or retrieves the cached sitemap XML.
   */
  async getSitemapXml(): Promise<string> {
    const now = Date.now();

    if (
      this.cachedXml !== null &&
      this.cachedAt !== null &&
      now - this.cachedAt < this.cacheTtlMs
    ) {
      return this.cachedXml;
    }

    if (this.inFlightPromise !== null) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = this.generateXml();

    try {
      const xml = await this.inFlightPromise;
      this.cachedXml = xml;
      this.cachedAt = Date.now();
      return xml;
    } finally {
      this.inFlightPromise = null;
    }
  }

  /**
   * Clears in-memory cache forcing subsequent calls to query the database.
   */
  invalidateCache(): void {
    this.cachedXml = null;
    this.cachedAt = null;
    this.inFlightPromise = null;
  }

  /**
   * Queries repository and generates fresh sitemap XML document.
   */
  private async generateXml(): Promise<string> {
    const [teams, players, articles] = await Promise.all([
      this.repository.getTeams(),
      this.repository.getPlayers(),
      this.repository.getArticles()
    ]);

    const baseUrl = this.getBaseUrl();
    const urls: SitemapUrlEntry[] = [];

    // Static platform routes
    for (const route of STATIC_ROUTES) {
      urls.push({
        loc: `${baseUrl}${route.path}`,
        changefreq: route.changefreq,
        priority: route.priority
      });
    }

    // Dynamic teams
    for (const team of teams) {
      urls.push({
        loc: `${baseUrl}/equipos/${team.id}`,
        lastmod: formatSitemapDate(team.updatedAt),
        changefreq: 'weekly',
        priority: 0.7
      });
    }

    // Dynamic players
    for (const player of players) {
      urls.push({
        loc: `${baseUrl}/jugadores/${player.id}`,
        lastmod: formatSitemapDate(player.updatedAt),
        changefreq: 'weekly',
        priority: 0.6
      });
    }

    // Dynamic editorial articles
    for (const article of articles) {
      urls.push({
        loc: `${baseUrl}/editorial/${article.id}`,
        lastmod: formatSitemapDate(article.updatedAt),
        changefreq: 'monthly',
        priority: 0.7
      });
    }

    return buildSitemapXml(urls);
  }
}
