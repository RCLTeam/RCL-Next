import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import type { CompetitionRepository } from '../../apps/api/src/modules/competition/competition.repository.js';
import type { SitemapRepository } from '../../apps/api/src/modules/sitemap/persistence/sitemap.repository.js';
import { SitemapService } from '../../apps/api/src/modules/sitemap/processing/sitemap.service.js';

function createMockRepository(): SitemapRepository {
  return {
    getTeams: vi.fn().mockResolvedValue([
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Lobos DEMO',
        seasonName: 'Temporada 1',
        divisionName: 'Premier',
        isActive: true,
        updatedAt: new Date('2026-09-01T10:00:00Z')
      }
    ]),
    getPlayers: vi.fn().mockResolvedValue([
      {
        id: '20000000-0000-4000-8000-000000000001',
        gameName: 'Jugador Demo',
        riotTag: 'EUW',
        updatedAt: new Date('2026-09-05T12:00:00Z')
      }
    ]),
    getArticles: vi
      .fn()
      .mockResolvedValue([
        { id: '30000000-0000-4000-8000-000000000001', updatedAt: new Date('2026-09-10T14:00:00Z') }
      ])
  };
}

describe('Sitemap Router Integration (GET /api/sitemap.xml)', () => {
  it('returns status 200 with XML content-type, cache-control headers, and valid sitemap XML containing static and dynamic urls', async () => {
    const repository = createMockRepository();
    const sitemapService = new SitemapService(repository, {
      baseUrl: 'https://rebelcrownlegacy.es'
    });

    const app = createApp({
      repository: {} as CompetitionRepository,
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:5173',
      sitemapService
    });

    const res = await request(app).get('/api/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.headers['cache-control']).toBe('public, max-age=300');

    expect(res.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

    // Static URLs
    expect(res.text).toContain('<loc>https://rebelcrownlegacy.es/</loc>');
    expect(res.text).toContain('<loc>https://rebelcrownlegacy.es/calendario</loc>');
    expect(res.text).toContain('<loc>https://rebelcrownlegacy.es/clasificacion</loc>');

    // Dynamic URLs
    expect(res.text).toContain('<loc>https://rebelcrownlegacy.es/equipos/lobos-demo</loc>');
    expect(res.text).toContain('<loc>https://rebelcrownlegacy.es/jugadores/jugador-demo-euw</loc>');
    expect(res.text).toContain(
      '<loc>https://rebelcrownlegacy.es/editorial/30000000-0000-4000-8000-000000000001</loc>'
    );
  });

  it('initializes service and serves sitemap when sitemapRepository is provided in options', async () => {
    const repository = createMockRepository();

    const app = createApp({
      repository: {} as CompetitionRepository,
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:5173',
      sitemapRepository: repository
    });

    const res = await request(app).get('/api/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  it('delegates errors to Express error middleware when sitemap generation fails', async () => {
    const failingService = {
      getSitemapXml: vi.fn().mockRejectedValue(new Error('Database query failure')),
      invalidateCache: vi.fn()
    } as unknown as SitemapService;

    const app = createApp({
      repository: {} as CompetitionRepository,
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:5173',
      sitemapService: failingService
    });

    const res = await request(app).get('/api/sitemap.xml');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 404 when neither sitemapService nor sitemapRepository is configured', async () => {
    const app = createApp({
      repository: {} as CompetitionRepository,
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:5173'
    });

    const res = await request(app).get('/api/sitemap.xml');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  const webDirectory = fileURLToPath(new URL('../../apps/web/public', import.meta.url));
  const appWith = (options: { sitemapService?: SitemapService; webDirectory?: string } = {}) =>
    createApp({
      repository: {} as CompetitionRepository,
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:5173',
      sitemapService:
        options.sitemapService ??
        new SitemapService(createMockRepository(), { baseUrl: 'https://rebelcrownlegacy.es' }),
      ...(options.webDirectory ? { webDirectory: options.webDirectory } : {})
    });

  it('does not expose the nested /api/sitemap.xml/sitemap.xml path', async () => {
    const res = await request(appWith()).get('/api/sitemap.xml/sitemap.xml');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('serves the same document at the root /sitemap.xml path', async () => {
    const app = appWith();
    const root = await request(app).get('/sitemap.xml').expect(200);
    const api = await request(app).get('/api/sitemap.xml').expect(200);
    expect(root.headers['content-type']).toMatch(/application\/xml/);
    expect(root.text).toBe(api.text);
  });

  it('answers /sitemap.xml with XML even when the web build is served and the client accepts HTML', async () => {
    const builtWeb = mkdtempSync(join(tmpdir(), 'rcl-sitemap-web-'));
    try {
      writeFileSync(
        join(builtWeb, 'index.html'),
        '<html><head><!-- page-metadata:start --><!-- page-metadata:end --></head></html>'
      );
      const res = await request(appWith({ webDirectory: builtWeb }))
        .get('/sitemap.xml')
        .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
        .expect(200);
      expect(res.headers['content-type']).toMatch(/application\/xml/);
      expect(res.text).toContain('<urlset');
    } finally {
      rmSync(builtWeb, { recursive: true, force: true });
    }
  });

  it('serves robots.txt from the web build pointing to the sitemap URL the API answers', async () => {
    const robots = readFileSync(`${webDirectory}/robots.txt`, 'utf8');
    const sitemapLine = robots.split('\n').find((line) => line.startsWith('Sitemap:'));
    expect(sitemapLine).toBe('Sitemap: https://rebelcrownlegacy.es/sitemap.xml');

    const app = appWith({ webDirectory });
    const res = await request(app).get('/robots.txt').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('Sitemap: https://rebelcrownlegacy.es/sitemap.xml');
    const path = new URL(sitemapLine?.slice('Sitemap:'.length).trim() ?? '').pathname;
    const sitemap = await request(app).get(path).expect(200);
    expect(sitemap.text).toContain('<urlset');
  });
});
