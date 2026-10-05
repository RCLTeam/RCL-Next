import { pageMetadata } from '@rcl/contracts';
import { playerProfileSlugs, teamProfileSlugs } from '../../competition/profile-slugs.js';
import type { SitemapRepository } from '../persistence/sitemap.repository.js';
import type { SitemapChangeFrequency, SitemapUrlEntry } from '../types/sitemap.types.js';
import { buildSitemapXml, formatSitemapDate } from './sitemap-builder.js';

// Admin writes invalidate the cache; the TTL only bounds changes made outside the API.
export const DEFAULT_SITEMAP_CACHE_TTL_MS = 60 * 60 * 1000; // 3,600,000 ms (1 hour)

export interface SitemapServiceOptions {
  baseUrl?: string;
  cacheTtlMs?: number;
}

interface StaticRouteSettings {
  priority: number;
  changefreq: SitemapChangeFrequency;
}

const DEFAULT_STATIC_ROUTE_SETTINGS: StaticRouteSettings = { priority: 0.5, changefreq: 'weekly' };

const STATIC_ROUTE_SETTINGS: Readonly<Record<string, StaticRouteSettings>> = {
  '/': { priority: 1.0, changefreq: 'daily' },
  '/calendario': { priority: 0.9, changefreq: 'daily' },
  '/clasificacion': { priority: 0.9, changefreq: 'daily' },
  '/predicciones': { priority: 0.8, changefreq: 'weekly' },
  '/equipos': { priority: 0.8, changefreq: 'weekly' },
  '/jugadores': { priority: 0.8, changefreq: 'weekly' },
  '/ligas': { priority: 0.7, changefreq: 'weekly' },
  '/playoffs': { priority: 0.7, changefreq: 'weekly' },
  '/campeones': { priority: 0.6, changefreq: 'weekly' },
  '/bola-cristal': { priority: 0.6, changefreq: 'weekly' }
};

/**
 * Public static pages, taken from the shared page metadata so the sitemap cannot announce a
 * path the web does not serve. The admin area is excluded.
 */
export const SITEMAP_STATIC_PATHS: readonly string[] = Object.keys(pageMetadata).filter(
  (path) => path !== '/admin' && !path.startsWith('/admin/')
);

export class SitemapService {
  private readonly cacheTtlMs: number;
  private cachedXml: string | null = null;
  private cachedAt: number | null = null;
  private inFlightPromise: Promise<string> | null = null;
  private generation = 0;

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

    const generation = this.generation;
    const promise = this.generateXml();
    this.inFlightPromise = promise;

    try {
      const xml = await promise;
      // A generation started before invalidateCache() may hold stale data: never cache it.
      if (generation === this.generation) {
        this.cachedXml = xml;
        this.cachedAt = Date.now();
      }
      return xml;
    } finally {
      if (this.inFlightPromise === promise) this.inFlightPromise = null;
    }
  }

  /**
   * Clears in-memory cache forcing subsequent calls to query the database.
   * Called after successful admin writes (see sitemap-invalidation.ts).
   */
  invalidateCache(): void {
    this.generation++;
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
    for (const path of SITEMAP_STATIC_PATHS) {
      const settings = STATIC_ROUTE_SETTINGS[path] ?? DEFAULT_STATIC_ROUTE_SETTINGS;
      urls.push({
        loc: `${baseUrl}${path}`,
        changefreq: settings.changefreq,
        priority: settings.priority
      });
    }

    // Same slugs and fallback as the web links (`slug ?? id`, URI-encoded).
    const teamSlugs = teamProfileSlugs(teams);
    const playerSlugs = playerProfileSlugs(players);
    const profilePath = (slugs: Map<string, string>, id: string) =>
      encodeURIComponent(slugs.get(id) ?? id);

    // Dynamic teams (inactive teams only take part in slug disambiguation)
    for (const team of teams) {
      if (!team.isActive) continue;
      urls.push({
        loc: `${baseUrl}/equipos/${profilePath(teamSlugs, team.id)}`,
        lastmod: formatSitemapDate(team.updatedAt),
        changefreq: 'weekly',
        priority: 0.7
      });
    }

    // Dynamic players
    for (const player of players) {
      urls.push({
        loc: `${baseUrl}/jugadores/${profilePath(playerSlugs, player.id)}`,
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
