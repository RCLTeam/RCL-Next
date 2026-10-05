import { getPageMetadata, pageMetadata } from '@rcl/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playerProfileSlugs, teamProfileSlugs } from '../../competition/profile-slugs.js';
import type { SitemapRepository } from '../persistence/sitemap.repository.js';
import type {
  SitemapArticleItem,
  SitemapPlayerItem,
  SitemapTeamItem
} from '../types/sitemap.types.js';
import {
  DEFAULT_SITEMAP_CACHE_TTL_MS,
  SITEMAP_STATIC_PATHS,
  SitemapService
} from './sitemap.service.js';

const teamItem = (
  id: string,
  name = id,
  overrides: Partial<SitemapTeamItem> = {}
): SitemapTeamItem => ({
  id,
  name,
  seasonName: 'Temporada 1',
  divisionName: 'Premier',
  isActive: true,
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  ...overrides
});

const playerItem = (
  id: string,
  gameName = id,
  overrides: Partial<SitemapPlayerItem> = {}
): SitemapPlayerItem => ({
  id,
  gameName,
  riotTag: null,
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  ...overrides
});

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
    const staticLocs = (xml: string) =>
      [...xml.matchAll(/<loc>https:\/\/rebelcrownlegacy\.es(\/[^<]*)<\/loc>/g)]
        .map((match) => match[1] ?? '')
        .filter((path) => !/^\/(equipos|jugadores|editorial)\/./.test(path));

    it('publishes /campeones and /bola-cristal instead of the non-existent English paths', async () => {
      const xml = await new SitemapService(createMockRepo()).getSitemapXml();

      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/campeones</loc>');
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/bola-cristal</loc>');
      expect(xml).not.toContain('/champions');
      expect(xml).not.toContain('/crystal-ball');
    });

    it('only publishes static paths that resolve to a known page', async () => {
      const xml = await new SitemapService(createMockRepo()).getSitemapXml();
      const paths = staticLocs(xml);

      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        expect(getPageMetadata(path).title, path).not.toBe('Página no encontrada');
      }
    });

    it('derives the static paths from pageMetadata, excluding the admin area', async () => {
      const xml = await new SitemapService(createMockRepo()).getSitemapXml();
      const expected = Object.keys(pageMetadata).filter(
        (path) => path !== '/admin' && !path.startsWith('/admin/')
      );

      expect(staticLocs(xml).sort()).toEqual([...expected].sort());
      expect(SITEMAP_STATIC_PATHS).toEqual(expected);
      expect(xml).not.toContain('/admin');
    });

    it('keeps the priority and change frequency of each public section', async () => {
      const xml = await new SitemapService(createMockRepo()).getSitemapXml();
      const expectEntry = (path: string, changefreq: string, priority: string) =>
        expect(xml).toMatch(
          new RegExp(
            `<loc>https://rebelcrownlegacy\\.es${path}</loc>\\s*<changefreq>${changefreq}</changefreq>\\s*<priority>${priority}</priority>`
          )
        );

      expectEntry('/', 'daily', '1\\.0');
      expectEntry('/calendario', 'daily', '0\\.9');
      expectEntry('/clasificacion', 'daily', '0\\.9');
      expectEntry('/predicciones', 'weekly', '0\\.8');
      expectEntry('/equipos', 'weekly', '0\\.8');
      expectEntry('/jugadores', 'weekly', '0\\.8');
      expectEntry('/ligas', 'weekly', '0\\.7');
      expectEntry('/playoffs', 'weekly', '0\\.7');
      expectEntry('/campeones', 'weekly', '0\\.6');
      expectEntry('/bola-cristal', 'weekly', '0\\.6');
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
        teamItem('team-1', 'Lobos', { updatedAt: new Date('2026-09-15T10:00:00Z') }),
        teamItem('team-2', 'Halcones', { updatedAt: new Date('2026-09-20T12:00:00Z') })
      ];
      const mockPlayers: SitemapPlayerItem[] = [
        playerItem('player-alpha', 'Alpha', {
          riotTag: 'EUW',
          updatedAt: new Date('2026-10-01T08:00:00Z')
        })
      ];
      const mockArticles: SitemapArticleItem[] = [
        teamItem('article-headline', 'article-headline', {
          updatedAt: new Date('2026-10-02T18:00:00Z')
        })
      ];

      const repo = createMockRepo({
        getTeams: vi.fn().mockResolvedValue(mockTeams),
        getPlayers: vi.fn().mockResolvedValue(mockPlayers),
        getArticles: vi.fn().mockResolvedValue(mockArticles)
      });

      const service = new SitemapService(repo);
      const xml = await service.getSitemapXml();

      // Team entries use the public slug
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/equipos\/lobos<\/loc>\s*<lastmod>2026-09-15<\/lastmod>\s*<changefreq>weekly<\/changefreq>\s*<priority>0\.7<\/priority>/
      );
      expect(xml).toContain('<loc>https://rebelcrownlegacy.es/equipos/halcones</loc>');
      expect(xml).toContain('<lastmod>2026-09-20</lastmod>');
      expect(xml).not.toContain('/equipos/team-1');

      // Player entries use the public slug
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/jugadores\/alpha-euw<\/loc>\s*<lastmod>2026-10-01<\/lastmod>\s*<changefreq>weekly<\/changefreq>\s*<priority>0\.6<\/priority>/
      );
      expect(xml).not.toContain('/jugadores/player-alpha');

      // Editorial article entries
      expect(xml).toMatch(
        /<loc>https:\/\/rebelcrownlegacy\.es\/editorial\/article-headline<\/loc>\s*<lastmod>2026-10-02<\/lastmod>\s*<changefreq>monthly<\/changefreq>\s*<priority>0\.7<\/priority>/
      );
    });

    it('builds team and player URLs with the same slugs as the competition API', async () => {
      const teams = [
        teamItem('00000000-0000-4000-8000-000000000001', 'Rebels', { divisionName: 'Alpha' }),
        teamItem('00000000-0000-4000-8000-000000000002', 'Rebels', { divisionName: 'Beta' }),
        teamItem('00000000-0000-4000-8000-000000000003', 'Rebels', {
          divisionName: 'Gamma',
          isActive: false
        }),
        teamItem('00000000-0000-4000-8000-000000000004', 'Águilas Ñandú')
      ];
      const players = [
        playerItem('10000000-0000-4000-8000-000000000001', 'Faker', { riotTag: 'KR1' }),
        playerItem('10000000-0000-4000-8000-000000000002', 'Faker', { riotTag: 'KR1 ' }),
        playerItem('10000000-0000-4000-8000-000000000003', '東京')
      ];
      const repo = createMockRepo({
        getTeams: vi.fn().mockResolvedValue(teams),
        getPlayers: vi.fn().mockResolvedValue(players)
      });

      const xml = await new SitemapService(repo).getSitemapXml();
      const teamSlugs = teamProfileSlugs(teams);
      const playerSlugs = playerProfileSlugs(players);

      for (const team of teams.filter((entry) => entry.isActive)) {
        const slug = teamSlugs.get(team.id) ?? '';
        expect(xml).toContain(
          `<loc>https://rebelcrownlegacy.es/equipos/${encodeURIComponent(slug)}</loc>`
        );
      }
      for (const player of players) {
        const slug = playerSlugs.get(player.id) ?? '';
        expect(xml).toContain(
          `<loc>https://rebelcrownlegacy.es/jugadores/${encodeURIComponent(slug)}</loc>`
        );
      }
      // Inactive teams are not published, but still take part in slug disambiguation.
      expect(xml).toContain('/equipos/rebels-temporada-1-alpha<');
      expect(xml).toContain('/equipos/rebels-temporada-1-beta<');
      expect(xml).not.toContain('rebels-temporada-1-gamma');
      expect(xml).toContain('/equipos/aguilas-nandu<');
      expect(xml).toContain(`/jugadores/${encodeURIComponent('東京')}<`);
      expect(xml).not.toMatch(/\/(equipos|jugadores)\/[0-9a-f]{8}-/);
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
      const getTeamsSpy = vi
        .fn()
        .mockResolvedValue([teamItem('t1', 't1', { updatedAt: new Date() })]);
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

      resolveTeams([
        teamItem('t-concurrent', 't-concurrent', { updatedAt: new Date('2026-10-01T00:00:00Z') })
      ]);

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
          teamItem('team-initial', 'team-initial', { updatedAt: new Date('2026-09-01T00:00:00Z') })
        ])
        .mockResolvedValueOnce([
          teamItem('team-refreshed', 'team-refreshed', {
            updatedAt: new Date('2026-09-02T00:00:00Z')
          })
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

    it('defaults cache TTL to 1 hour (3_600_000 ms)', async () => {
      vi.useFakeTimers();
      expect(DEFAULT_SITEMAP_CACHE_TTL_MS).toBe(3_600_000);

      const getTeamsSpy = vi.fn().mockResolvedValue([]);
      const repo = createMockRepo({ getTeams: getTeamsSpy });

      const service = new SitemapService(repo);
      await service.getSitemapXml();
      expect(getTeamsSpy).toHaveBeenCalledTimes(1);

      // Advance by 1 hour minus 1 ms -> still cached
      vi.advanceTimersByTime(3_600_000 - 1);
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
        .mockResolvedValueOnce([
          teamItem('team-v1', 'team-v1', { updatedAt: new Date('2026-09-01T00:00:00Z') })
        ])
        .mockResolvedValueOnce([
          teamItem('team-v2', 'team-v2', { updatedAt: new Date('2026-09-02T00:00:00Z') })
        ]);

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

    it('does not cache a generation that was already running when the cache was invalidated', async () => {
      let resolveStale: (value: SitemapTeamItem[]) => void = () => {};
      const getTeamsSpy = vi
        .fn()
        .mockReturnValueOnce(
          new Promise<SitemapTeamItem[]>((resolve) => {
            resolveStale = resolve;
          })
        )
        .mockResolvedValue([teamItem('team-fresh')]);
      const service = new SitemapService(createMockRepo({ getTeams: getTeamsSpy }));

      const stale = service.getSitemapXml();
      service.invalidateCache();
      resolveStale([teamItem('team-stale')]);
      expect(await stale).toContain('/equipos/team-stale');

      const fresh = await service.getSitemapXml();
      expect(fresh).toContain('/equipos/team-fresh');
      expect(fresh).not.toContain('/equipos/team-stale');
      expect(getTeamsSpy).toHaveBeenCalledTimes(2);
    });

    it('does not cache when repository query rejects and allows subsequent retry', async () => {
      const repoError = new Error('Database connection failed');
      const getTeamsSpy = vi
        .fn()
        .mockRejectedValueOnce(repoError)
        .mockResolvedValueOnce([
          teamItem('team-retry', 'team-retry', { updatedAt: new Date('2026-09-01T00:00:00Z') })
        ]);

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
