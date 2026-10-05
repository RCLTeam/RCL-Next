import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SitemapRepository } from '../persistence/sitemap.repository.js';
import type {
  SitemapArticleItem,
  SitemapPlayerItem,
  SitemapTeamItem
} from '../types/sitemap.types.js';
import { DEFAULT_SITEMAP_CACHE_TTL_MS, SitemapService } from './sitemap.service.js';

describe('SitemapService', () => {
  let initialEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.useRealTimers();
    initialEnv = { ...process.env };
    process.env.FRONTEND_URL = 'https://rebelcrownlegacy.es';
  });

  afterEach(() => {
    process.env = initialEnv;
    vi.useRealTimers();
  });

  const createMockRepo = (overrides?: Partial<SitemapRepository>): SitemapRepository => ({
    getTeams: vi.fn().mockResolvedValue([]),
    getPlayers: vi.fn().mockResolvedValue([]),
    getArticles: vi.fn().mockResolvedValue([]),
    ...overrides
  });

  describe('Static Routes', () => {
    it('generates XML containing all 10 static platform routes with exact priorities and frequencies', async () => {
      const repo = createMockRepo();
      const service = new SitemapService(repo);

      const xml = await service.getSitemapXml();

      // Root
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>daily<\/changefreq>\s*<priority>1\.0<\/priority>/
      );

      // Daily 0.9 routes
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/calendario</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/calendario<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>daily<\/changefreq>\s*<priority>0\.9<\/priority>/
      );

      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/clasificacion</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/clasificacion<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>daily<\/changefreq>\s*<priority>0\.9<\/priority>/
      );

      // Weekly 0.8 routes
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/predicciones</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/predicciones<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>weekly<\/changefreq>\s*<priority>0\.8<\/priority>/
      );

      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/equipos</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/equipos<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>weekly<\/changefreq>\s*<priority>0\.8<\/priority>/
      );

      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/jugadores</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/jugadores<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>weekly<\/changefreq>\s*<priority>0\.8<\/priority>/
      );

      // Weekly 0.7 routes
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/ligas</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/ligas<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>weekly<\/changefreq>\s*<priority>0\.7<\/priority>/
      );

      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/playoffs</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/playoffs<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>weekly<\/changefreq>\s*<priority>0\.7<\/priority>/
      );

      // Weekly 0.6 routes
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/champions</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/champions<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>weekly<\/changefreq>\s*<priority>0\.6<\/priority>/
      );

      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/crystal-ball</loc>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/crystal-ball<\/loc>\s*(?:<[^>]+>\s*)*<changefreq>weekly<\/changefreq>\s*<priority>0\.6<\/priority>/
      );

      expect(xml.match(/<url>/g)).toHaveLength(10);
      expect(xml).not.toContain('/fantasy');
    });

    it('outputs valid standard XML header and urlset tag', async () => {
      const repo = createMockRepo();
      const service = new SitemapService(repo);

      const xml = await service.getSitemapXml();

      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(xml.endsWith('</urlset>')).toBe(true);
    });
  });

  describe('Dynamic Routes from Repository', () => {
    it('aggregates teams, players, and articles with correct metadata', async () => {
      const mockTeams: SitemapTeamItem[] = [
        { id: 'team-1', updatedAt: new Date('2026-09-15T10:00:00Z') },
        { id: 'team-2', updatedAt: new Date('2026-09-20T12:00:00Z') }
      ];
      const mockPlayers: SitemapPlayerItem[] = [
        { id: 'player-alpha', updatedAt: new Date('2026-10-01T08:00:00Z') }
      ];
      const mockArticles: SitemapArticleItem[] = [
        { id: 'article-headline', updatedAt: new Date('2026-10-02T18:00:00Z') }
      ];

      const repo = createMockRepo({
        getTeams: vi.fn().mockResolvedValue(mockTeams),
        getPlayers: vi.fn().mockResolvedValue(mockPlayers),
        getArticles: vi.fn().mockResolvedValue(mockArticles)
      });

      const service = new SitemapService(repo);
      const xml = await service.getSitemapXml();

      // Team entries
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/equipos/team-1</loc>');
      expect(xml).toContain('<lastmod>2026-09-15</lastmod>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/equipos\/team-1<\/loc>\s*<lastmod>2026-09-15<\/lastmod>\s*<changefreq>weekly<\/changefreq>\s*<priority>0\.7<\/priority>/
      );

      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/equipos/team-2</loc>');
      expect(xml).toContain('<lastmod>2026-09-20</lastmod>');

      // Player entries
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/jugadores/player-alpha</loc>');
      expect(xml).toContain('<lastmod>2026-10-01</lastmod>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/jugadores\/player-alpha<\/loc>\s*<lastmod>2026-10-01<\/lastmod>\s*<changefreq>weekly<\/changefreq>\s*<priority>0\.6<\/priority>/
      );

      // Editorial article entries
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/editorial/article-headline</loc>');
      expect(xml).toContain('<lastmod>2026-10-02</lastmod>');
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/editorial\/article-headline<\/loc>\s*<lastmod>2026-10-02<\/lastmod>\s*<changefreq>monthly<\/changefreq>\s*<priority>0\.7<\/priority>/
      );
    });

    it('queries repository methods concurrently via Promise.all', async () => {
      const getTeamsSpy = vi.fn().mockResolvedValue([]);
      const getPlayersSpy = vi.fn().mockResolvedValue([]);
      const getArticlesSpy = vi.fn().mockResolvedValue([]);

      const repo = createMockRepo({
        getTeams: getTeamsSpy,
        getPlayers: getPlayersSpy,
        getArticles: getArticlesSpy
      });

      const service = new SitemapService(repo);
      await service.getSitemapXml();

      expect(getTeamsSpy).toHaveBeenCalledOnce();
      expect(getPlayersSpy).toHaveBeenCalledOnce();
      expect(getArticlesSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Base URL Resolution', () => {
    it('uses custom baseUrl option stripped of trailing slashes', async () => {
      const repo = createMockRepo();
      const service = new SitemapService(repo, {
        baseUrl: 'https://staging.rebelcrownlegacy.es///'
      });

      const xml = await service.getSitemapXml();

      expect(xml).toContain('<loc>https://staging.rebelcrownlegacy.es/</loc>');
      expect(xml).toContain('<loc>https://staging.rebelcrownlegacy.es/calendario</loc>');
      expect(xml).not.toContain('https://rebelcrownlegacy.es');
    });

    it('falls back to FRONTEND_URL environment variable when baseUrl option is omitted', async () => {
      process.env.FRONTEND_URL = 'https://preview.rebelcrownlegacy.es/';
      const repo = createMockRepo();
      const service = new SitemapService(repo);

      const xml = await service.getSitemapXml();

      expect(xml).toContain('<loc>https://preview.rebelcrownlegacy.es/</loc>');
      expect(xml).toContain('<loc>https://preview.rebelcrownlegacy.es/clasificacion</loc>');
    });

    it('falls back to default https://rebelcrownlegacy.es when neither option nor env is set', async () => {
      Reflect.deleteProperty(process.env, 'FRONTEND_URL');
      const repo = createMockRepo();
      const service = new SitemapService(repo);

      const xml = await service.getSitemapXml();

      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/</loc>');
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/predicciones</loc>');
    });
  });

  describe('In-Memory TTL Caching', () => {
    it('serves subsequent calls from cache without re-querying repository', async () => {
      const getTeamsSpy = vi.fn().mockResolvedValue([{ id: 't1', updatedAt: new Date() }]);
      const getPlayersSpy = vi.fn().mockResolvedValue([]);
      const getArticlesSpy = vi.fn().mockResolvedValue([]);

      const repo = createMockRepo({
        getTeams: getTeamsSpy,
        getPlayers: getPlayersSpy,
        getArticles: getArticlesSpy
      });

      const service = new SitemapService(repo);

      const xmlFirst = await service.getSitemapXml();
      const xmlSecond = await service.getSitemapXml();
      const xmlThird = await service.getSitemapXml();

      expect(xmlFirst).toBe(xmlSecond);
      expect(xmlSecond).toBe(xmlThird);
      expect(getTeamsSpy).toHaveBeenCalledTimes(1);
      expect(getPlayersSpy).toHaveBeenCalledTimes(1);
      expect(getArticlesSpy).toHaveBeenCalledTimes(1);
    });

    it('deduplicates simultaneous concurrent calls while cache is cold', async () => {
      let resolveTeams: (value: SitemapTeamItem[]) => void = () => {};
      const teamsPromise = new Promise<SitemapTeamItem[]>((resolve) => {
        resolveTeams = resolve;
      });

      const getTeamsSpy = vi.fn().mockReturnValue(teamsPromise);
      const repo = createMockRepo({
        getTeams: getTeamsSpy
      });

      const service = new SitemapService(repo);

      const promise1 = service.getSitemapXml();
      const promise2 = service.getSitemapXml();
      const promise3 = service.getSitemapXml();

      resolveTeams([{ id: 't-concurrent', updatedAt: new Date('2026-10-01T00:00:00Z') }]);

      const [xml1, xml2, xml3] = await Promise.all([promise1, promise2, promise3]);

      expect(xml1).toBe(xml2);
      expect(xml2).toBe(xml3);
      expect(getTeamsSpy).toHaveBeenCalledTimes(1);
    });

    it('re-queries repository when cache TTL expires', async () => {
      vi.useFakeTimers();
      const getTeamsSpy = vi
        .fn()
        .mockResolvedValueOnce([
          { id: 'team-initial', updatedAt: new Date('2026-09-01T00:00:00Z') }
        ])
        .mockResolvedValueOnce([
          { id: 'team-refreshed', updatedAt: new Date('2026-09-02T00:00:00Z') }
        ]);

      const repo = createMockRepo({
        getTeams: getTeamsSpy
      });

      const service = new SitemapService(repo, { cacheTtlMs: 10_000 });

      const xml1 = await service.getSitemapXml();
      expect(xml1).toContain('/equipos/team-initial');
      expect(getTeamsSpy).toHaveBeenCalledTimes(1);

      // Advance by 9 seconds (within TTL)
      vi.advanceTimersByTime(9_000);
      const xmlStillCached = await service.getSitemapXml();
      expect(xmlStillCached).toContain('/equipos/team-initial');
      expect(getTeamsSpy).toHaveBeenCalledTimes(1);

      // Advance by 2 more seconds (total 11 seconds > 10_000 ms TTL)
      vi.advanceTimersByTime(2_000);
      const xmlRefreshed = await service.getSitemapXml();
      expect(xmlRefreshed).toContain('/equipos/team-refreshed');
      expect(getTeamsSpy).toHaveBeenCalledTimes(2);
    });

    it('defaults cache TTL to 12 hours (43_200_000 ms)', async () => {
      vi.useFakeTimers();
      expect(DEFAULT_SITEMAP_CACHE_TTL_MS).toBe(43_200_000);

      const getTeamsSpy = vi.fn().mockResolvedValue([]);
      const repo = createMockRepo({ getTeams: getTeamsSpy });

      const service = new SitemapService(repo);
      await service.getSitemapXml();
      expect(getTeamsSpy).toHaveBeenCalledTimes(1);

      // Advance by 12 hours minus 1 ms -> still cached
      vi.advanceTimersByTime(43_200_000 - 1);
      await service.getSitemapXml();
      expect(getTeamsSpy).toHaveBeenCalledTimes(1);

      // Advance by 1 ms -> expired
      vi.advanceTimersByTime(1);
      await service.getSitemapXml();
      expect(getTeamsSpy).toHaveBeenCalledTimes(2);
    });

    it('forces fresh repository query when invalidateCache() is invoked', async () => {
      const getTeamsSpy = vi
        .fn()
        .mockResolvedValueOnce([{ id: 'team-v1', updatedAt: new Date('2026-09-01T00:00:00Z') }])
        .mockResolvedValueOnce([{ id: 'team-v2', updatedAt: new Date('2026-09-02T00:00:00Z') }]);

      const repo = createMockRepo({ getTeams: getTeamsSpy });
      const service = new SitemapService(repo);

      const xml1 = await service.getSitemapXml();
      expect(xml1).toContain('/equipos/team-v1');
      expect(getTeamsSpy).toHaveBeenCalledTimes(1);

      // Invalidate cache explicitly
      service.invalidateCache();

      const xml2 = await service.getSitemapXml();
      expect(xml2).toContain('/equipos/team-v2');
      expect(getTeamsSpy).toHaveBeenCalledTimes(2);
    });

    it('does not cache when repository query rejects and allows subsequent retry', async () => {
      const repoError = new Error('Database connection failed');
      const getTeamsSpy = vi
        .fn()
        .mockRejectedValueOnce(repoError)
        .mockResolvedValueOnce([{ id: 'team-retry', updatedAt: new Date('2026-09-01T00:00:00Z') }]);

      const repo = createMockRepo({ getTeams: getTeamsSpy });
      const service = new SitemapService(repo);

      await expect(service.getSitemapXml()).rejects.toThrow('Database connection failed');
      expect(getTeamsSpy).toHaveBeenCalledTimes(1);

      // Retry should execute query again and succeed
      const xml = await service.getSitemapXml();
      expect(xml).toContain('/equipos/team-retry');
      expect(getTeamsSpy).toHaveBeenCalledTimes(2);
    });
  });
});
