import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import type { CrudRecord } from '@rcl/contracts';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import { DiscordOAuthClient } from '../../apps/api/src/modules/auth/discord.client.js';
import { PostgresAuthRepository } from '../../apps/api/src/modules/auth/postgres-auth.repository.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import { crudResources } from '../../apps/api/src/modules/crud-operations/crud-operations.resources.js';
import { PostgresCrudOperationsRepository } from '../../apps/api/src/modules/crud-operations/postgres-crud-operations.repository.js';
import { PostgresHomeContentRepository } from '../../apps/api/src/modules/home-content/postgres-home-content.repository.js';
import { PostgresSitemapRepository } from '../../apps/api/src/modules/sitemap/persistence/postgres-sitemap.repository.js';
import { SitemapService } from '../../apps/api/src/modules/sitemap/processing/sitemap.service.js';
import * as schema from '../../packages/database/src/schema.js';

describe('sitemap against the competition API and admin writes', () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const imageDirectory = mkdtempSync(join(tmpdir(), 'rcl-sitemap-images-'));
  const origin = 'http://localhost:5173';
  const adminId = '123456789012345678';
  const viewerId = '223456789012345678';
  const adminToken = 'a'.repeat(64);
  const viewerToken = 'b'.repeat(64);
  const divisionA = '10000000-0000-4000-8000-00000000000a';
  const divisionB = '10000000-0000-4000-8000-00000000000b';
  const sitemapService = new SitemapService(new PostgresSitemapRepository(db), {
    baseUrl: 'https://rebelcrownlegacy.es'
  });
  const app = createApp({
    editorialImageDirectory: imageDirectory,
    teamLogoDirectory: join(imageDirectory, 'teams'),
    repository: new PostgresCompetitionRepository(db),
    crudOperationsRepository: new PostgresCrudOperationsRepository(db),
    homeContentRepository: new PostgresHomeContentRepository(db),
    sitemapService,
    checkDatabase: async () => {},
    corsOrigin: origin,
    auth: {
      service: new AuthService(
        new PostgresAuthRepository(db),
        new DiscordOAuthClient({
          clientId: adminId,
          clientSecret: 'test',
          redirectUri: `${origin}/callback`
        })
      ),
      secureCookies: false,
      frontendOrigin: origin
    }
  });
  const sitemap = async () => (await request(app).get('/sitemap.xml').expect(200)).text;
  const locs = (xml: string, section: string) =>
    [
      ...xml.matchAll(
        new RegExp(`<loc>https://rebelcrownlegacy\\.es/${section}/([^<]+)</loc>`, 'g')
      )
    ]
      .map((match) => decodeURIComponent(match[1] ?? ''))
      .sort();
  const send = (method: 'post' | 'put', path: string, body: object, token: string = adminToken) =>
    request(app)
      [method](path)
      .set('Cookie', `rcl_session=${token}`)
      .set('Origin', origin)
      .send(body);

  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
    await db.insert(schema.discordUsers).values([
      { discordId: adminId, username: 'Admin', role: 'admin' },
      { discordId: viewerId, username: 'Viewer' }
    ]);
    for (const [token, discordUserId] of [
      [adminToken, adminId],
      [viewerToken, viewerId]
    ] as const) {
      await db.insert(schema.authSessions).values({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        discordUserId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });
    }
    await db.insert(schema.seasons).values({ name: 'Temporada 1' });
    await db.insert(schema.divisions).values([{ name: 'Alpha' }, { name: 'Beta' }]);
    await db.insert(schema.seasonsDivisions).values([
      { id: divisionA, seasonName: 'Temporada 1', divisionName: 'Alpha' },
      { id: divisionB, seasonName: 'Temporada 1', divisionName: 'Beta' }
    ]);
    // Same team name in both divisions plus an inactive namesake: slugs need disambiguation.
    await db.insert(schema.teams).values([
      { seasonDivisionId: divisionA, name: 'Rebels' },
      { seasonDivisionId: divisionB, name: 'Rebels' },
      { seasonDivisionId: divisionB, name: 'Águilas Ñandú' },
      { seasonDivisionId: divisionA, name: 'Águilas Ñandú', isActive: false }
    ]);
    await db
      .insert(schema.players)
      .values([
        { gameName: 'Faker', riotTag: 'KR1' },
        { gameName: 'Faker', riotTag: 'KR1 ' },
        { gameName: '東京' },
        { gameName: 'Alterno', isMain: false }
      ]);
  });
  afterAll(async () => {
    await client.close();
    rmSync(imageDirectory, { recursive: true, force: true });
  });

  it('publishes teams and players with the slug returned by the competition API', async () => {
    const xml = await sitemap();
    expect(xml).not.toMatch(/\/(equipos|jugadores)\/[0-9a-f]{8}-[0-9a-f]{4}-/);

    const apiTeams: { slug?: string; isActive: boolean }[] = [];
    for (const division of [divisionA, divisionB]) {
      const response = await request(app).get(`/api/v1/divisions/${division}/teams`).expect(200);
      apiTeams.push(...response.body.data);
    }
    const activeSlugs = apiTeams
      .filter((team) => team.isActive)
      .map((team) => team.slug ?? '')
      .sort();
    expect(activeSlugs).toHaveLength(3);
    expect(locs(xml, 'equipos')).toEqual(activeSlugs);
    for (const slug of locs(xml, 'equipos')) {
      const detail = await request(app)
        .get(`/api/v1/teams/${encodeURIComponent(slug)}`)
        .expect(200);
      expect(detail.body.data.slug).toBe(slug);
    }

    const playerSlugs = locs(xml, 'jugadores');
    expect(playerSlugs).toHaveLength(4);
    const mainPlayers = (await request(app).get('/api/v1/players').expect(200)).body.data as {
      slug: string;
    }[];
    for (const player of mainPlayers) expect(playerSlugs).toContain(player.slug);
    for (const slug of playerSlugs) {
      const detail = await request(app)
        .get(`/api/v1/players/${encodeURIComponent(slug)}`)
        .expect(200);
      expect(detail.body.data.slug).toBe(slug);
    }
  });

  it('reflects a created or renamed team on the next sitemap request', async () => {
    expect(await sitemap()).not.toContain('/equipos/nuevo-equipo<');
    const created = await send('post', '/api/v1/crud-operations/teams', {
      name: 'Nuevo equipo',
      seasonDivisionId: divisionA
    }).expect(201);
    expect(await sitemap()).toContain('/equipos/nuevo-equipo<');

    const record = created.body.data as CrudRecord;
    const resource = crudResources.find((item) => item.name === 'teams');
    if (!resource) throw new Error('Missing teams resource');
    await send('put', '/api/v1/crud-operations/teams', {
      key: Object.fromEntries(resource.keys.map((key) => [key, record[key]])),
      version: record.updatedAt,
      values: {
        ...Object.fromEntries(resource.fields.map((field) => [field.name, record[field.name]])),
        name: 'Equipo renombrado'
      }
    }).expect(200);
    const xml = await sitemap();
    expect(xml).toContain('/equipos/equipo-renombrado<');
    expect(xml).not.toContain('/equipos/nuevo-equipo<');
  });

  it('reflects a published article on the next sitemap request', async () => {
    await sitemap();
    const article = await send('post', '/api/v1/home-content/admin/articles', {
      title: 'La final',
      excerpt: 'Una jornada para recordar.',
      body: 'Crónica de la final.',
      kind: 'reportaje',
      author: 'RCL',
      coverUrl: '',
      coverAlt: '',
      published: true,
      showOnHome: true,
      homeOrder: 1
    }).expect(201);
    expect(await sitemap()).toContain(`/editorial/${article.body.data.id}</loc>`);
  });

  it('keeps the cache when a write is rejected', async () => {
    await sitemap();
    const invalidate = vi.spyOn(sitemapService, 'invalidateCache');
    try {
      await send(
        'post',
        '/api/v1/crud-operations/teams',
        { name: 'Sin permiso', seasonDivisionId: divisionA },
        viewerToken
      ).expect(403);
      await request(app).get('/api/v1/crud-operations/teams').expect(401);
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      invalidate.mockRestore();
    }
  });
});
