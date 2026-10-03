import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import type { CompetitionRepository } from '../../apps/api/src/modules/competition/competition.repository.js';
import type { SitemapRepository } from '../../apps/api/src/modules/sitemap/persistence/sitemap.repository.js';
import { SitemapService } from '../../apps/api/src/modules/sitemap/processing/sitemap.service.js';

function createMockRepository(): SitemapRepository {
  return {
    getTeams: vi
      .fn()
      .mockResolvedValue([
        { id: '10000000-0000-4000-8000-000000000001', updatedAt: new Date('2026-09-01T10:00:00Z') }
      ]),
    getPlayers: vi
      .fn()
      .mockResolvedValue([
        { id: '20000000-0000-4000-8000-000000000001', updatedAt: new Date('2026-09-05T12:00:00Z') }
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
    expect(res.headers['cache-control']).toContain('max-age=3600');
    expect(res.headers['cache-control']).toContain('s-maxage=43200');

    expect(res.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

    // Static URLs
    expect(res.text).toContain('<loc>https://rebelcrownlegacy.es/</loc>');
    expect(res.text).toContain('<loc>https://rebelcrownlegacy.es/calendario</loc>');
    expect(res.text).toContain('<loc>https://rebelcrownlegacy.es/clasificacion</loc>');

    // Dynamic URLs
    expect(res.text).toContain(
      '<loc>https://rebelcrownlegacy.es/equipos/10000000-0000-4000-8000-000000000001</loc>'
    );
    expect(res.text).toContain(
      '<loc>https://rebelcrownlegacy.es/jugadores/20000000-0000-4000-8000-000000000001</loc>'
    );
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
    expect(res.headers['cache-control']).toContain('max-age=3600');
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
});
