import { type PageMetadata, getPageMetadata, pageMetadata } from '@rcl/contracts';
import { ZodError } from 'zod';
import { AppError } from '../../shared/app-error.js';
import type { CompetitionService } from '../competition/competition.service.js';
import type { HomeContentService } from '../home-content/home-content.service.js';

export const DEFAULT_PAGE_METADATA_CACHE_TTL_MS = 60_000;
export const DEFAULT_PAGE_METADATA_CACHE_MAX_ENTRIES = 500;

export interface PageMetadataServiceOptions {
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
}

// `found` tells the web router whether the path is a real page; the not-found texts alone
// cannot say it, because they are also a valid description for the endpoint.
export interface ResolvedPageMetadata {
  metadata: PageMetadata;
  found: boolean;
}

const detailPath = /^\/(equipos|jugadores|partidos|editorial)\/([^/]+)\/?$/;
const notFoundPage = (): ResolvedPageMetadata => ({
  metadata: getPageMetadata('/404'),
  found: false
});

// Same normalisation as getPageMetadata(): query string and trailing slash are ignored.
function resolveFixedPage(path: string): ResolvedPageMetadata {
  const normalized = path.split('?')[0]?.replace(/\/$/, '') || '/';
  return { metadata: getPageMetadata(path), found: Object.hasOwn(pageMetadata, normalized) };
}

export class PageMetadataService {
  private readonly cacheTtlMs: number;
  private readonly cacheMaxEntries: number;
  private readonly cache = new Map<string, { page: ResolvedPageMetadata; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<ResolvedPageMetadata>>();

  constructor(
    private readonly competition: Pick<
      CompetitionService,
      'teamSummary' | 'playerSummary' | 'matchSummary'
    >,
    private readonly content?: Pick<HomeContentService, 'article'>,
    options?: PageMetadataServiceOptions
  ) {
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_PAGE_METADATA_CACHE_TTL_MS;
    this.cacheMaxEntries = options?.cacheMaxEntries ?? DEFAULT_PAGE_METADATA_CACHE_MAX_ENTRIES;
  }

  // Detail pages are resolved from the database on every HTML request; a short TTL and a
  // shared in-flight lookup keep repeated visits and crawler bursts from repeating the queries.
  async resolve(path: string): Promise<ResolvedPageMetadata> {
    const detail = detailPath.exec(path);
    if (!detail?.[1] || !detail[2]) return resolveFixedPage(path);
    const now = Date.now();
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > now) return cached.page;
    const pending = this.inFlight.get(path);
    if (pending) return pending;
    const lookup = this.resolveDetail(path, detail[1], detail[2]);
    this.inFlight.set(path, lookup);
    try {
      const page = await lookup;
      this.store(path, page);
      return page;
    } finally {
      this.inFlight.delete(path);
    }
  }

  private store(key: string, page: ResolvedPageMetadata) {
    const now = Date.now();
    this.cache.delete(key);
    if (this.cache.size >= this.cacheMaxEntries)
      for (const [entry, value] of this.cache) if (value.expiresAt <= now) this.cache.delete(entry);
    // Map keeps insertion order, so the first entry is the oldest one.
    while (this.cache.size >= this.cacheMaxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { page, expiresAt: now + this.cacheTtlMs });
  }

  private async resolveDetail(
    path: string,
    kind: string,
    reference: string
  ): Promise<ResolvedPageMetadata> {
    const page = (metadata: PageMetadata): ResolvedPageMetadata => ({ metadata, found: true });
    // Without the editorial service the article cannot be checked, so the page is kept.
    const fallback = page(getPageMetadata(path));
    let id: string;
    try {
      id = decodeURIComponent(reference);
    } catch {
      return notFoundPage();
    }
    try {
      switch (kind) {
        case 'equipos': {
          const team = await this.competition.teamSummary(id);
          return page({
            title: team.name,
            description: `Conoce la plantilla de ${team.name} en ${team.divisionName}, temporada ${team.seasonName} de Rebel Crown Legacy.`
          });
        }
        case 'jugadores': {
          const player = await this.competition.playerSummary(id);
          const name = `${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''}`;
          return page({
            title: name,
            description: `Consulta el perfil, los equipos y las estadísticas de ${name} en Rebel Crown Legacy.`
          });
        }
        case 'partidos': {
          const match = await this.competition.matchSummary(id);
          return page({
            title: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
            description: `${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}. Consulta los mapas y las estadísticas de esta serie de ${match.divisionName} en Rebel Crown Legacy.`
          });
        }
        case 'editorial': {
          if (!this.content) return fallback;
          const article = await this.content.article(id);
          return page({
            title: article.title,
            description:
              article.excerpt.trim() ||
              `${article.title}. Lee el artículo de ${article.author} en Rebel Crown Legacy.`
          });
        }
      }
    } catch (error) {
      if ((error instanceof AppError && error.status === 404) || error instanceof ZodError)
        return notFoundPage();
      throw error;
    }
    return fallback;
  }
}
