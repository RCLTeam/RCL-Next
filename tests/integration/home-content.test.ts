import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import { DiscordOAuthClient } from '../../apps/api/src/modules/auth/discord.client.js';
import { PostgresAuthRepository } from '../../apps/api/src/modules/auth/postgres-auth.repository.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import { PostgresHomeContentRepository } from '../../apps/api/src/modules/home-content/postgres-home-content.repository.js';
import * as schema from '../../packages/database/src/schema.js';

describe('home content publication, authorization and persistence', () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const origin = 'http://localhost:5173';
  const tokens = { admin: 'a'.repeat(64), viewer: 'b'.repeat(64) };
  const app = createApp({
    repository: new PostgresCompetitionRepository(db),
    homeContentRepository: new PostgresHomeContentRepository(db),
    checkDatabase: async () => {},
    corsOrigin: origin,
    auth: {
      service: new AuthService(
        new PostgresAuthRepository(db),
        new DiscordOAuthClient({
          clientId: '123456789012345678',
          clientSecret: 'test',
          redirectUri: `${origin}/callback`
        })
      ),
      secureCookies: false,
      frontendOrigin: origin
    }
  });
  const root = '/api/v1/home-content';
  const article = {
    title: 'La final',
    excerpt: 'Una jornada para recordar.',
    body: 'Primera crónica.\n\n## La final\n\n> Una gran victoria.',
    kind: 'reportaje',
    author: 'RCL',
    coverUrl: '',
    coverAlt: '',
    published: false,
    showOnHome: true,
    homeOrder: 2
  };
  const team = {
    label: 'Jornada 3',
    published: true,
    players: ['top', 'jungle', 'mid', 'adc', 'support'].map((role) => ({
      role,
      name: `Player ${role}`,
      team: 'Rebels',
      imageUrl: ''
    }))
  };
  const divisionA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const divisionB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const cookie = (role: keyof typeof tokens) => `rcl_session=${tokens[role]}`;
  const post = (body: object) =>
    request(app)
      .post(`${root}/admin/articles`)
      .set('Cookie', cookie('admin'))
      .set('Origin', origin)
      .send(body);
  const put = (path: string, body: object) =>
    request(app)
      .put(`${root}/admin/${path}`)
      .set('Cookie', cookie('admin'))
      .set('Origin', origin)
      .send(body);
  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
    for (const [index, role] of (['admin', 'viewer'] as const).entries()) {
      const id = `${index + 1}23456789012345678`;
      await db.insert(schema.discordUsers).values({ discordId: id, username: role, role });
      await db.insert(schema.authSessions).values({
        tokenHash: createHash('sha256').update(tokens[role]).digest('hex'),
        discordUserId: id,
        expiresAt: new Date(Date.now() + 3600000)
      });
    }
    await db.insert(schema.seasons).values({ name: 'Season' });
    await db.insert(schema.divisions).values([{ name: 'Alpha' }, { name: 'Beta' }]);
    await db.insert(schema.seasonsDivisions).values([
      { id: divisionA, seasonName: 'Season', divisionName: 'Alpha' },
      { id: divisionB, seasonName: 'Season', divisionName: 'Beta' }
    ]);
  });
  afterAll(() => client.close());
  it('protects administration and rejects untrusted mutations', async () => {
    await request(app).get(`${root}/admin/articles`).expect(401);
    await request(app).get(`${root}/admin/articles`).set('Cookie', cookie('viewer')).expect(403);
    await request(app)
      .post(`${root}/admin/articles`)
      .set('Cookie', cookie('viewer'))
      .set('Origin', origin)
      .send(article)
      .expect(403);
    await request(app)
      .post(`${root}/admin/articles`)
      .set('Cookie', cookie('admin'))
      .set('Origin', 'https://evil.example')
      .send(article)
      .expect(403);
    await request(app)
      .put(`${root}/admin/weekly-teams/${divisionA}`)
      .set('Cookie', cookie('admin'))
      .send(team)
      .expect(403);
  });
  it('keeps drafts private, publishes, orders and hides articles independently of publication', async () => {
    const created = await post(article).expect(201);
    const id = created.body.data.id as string;
    await request(app).get(`${root}/articles/${id}`).expect(404);
    expect((await request(app).get(`${root}/articles`)).body.data).toHaveLength(0);
    const published = await put(`articles/${id}`, { ...article, published: true }).expect(200);
    expect(published.body.data.publishedAt).toBeTruthy();
    const first = await post({
      ...article,
      title: 'Entrevista',
      kind: 'entrevista',
      published: true,
      homeOrder: 0
    }).expect(201);
    const home = await request(app).get(`${root}/articles`).expect(200);
    expect(home.body.data.map((item: { id: string }) => item.id)).toEqual([first.body.data.id, id]);
    await put(`articles/${id}`, { ...article, published: true, showOnHome: false }).expect(200);
    await request(app).get(`${root}/articles/${id}`).expect(200);
    expect((await request(app).get(`${root}/articles`)).body.data).toHaveLength(1);
    await put(`articles/${id}`, { ...article, published: false }).expect(200);
    await request(app).get(`${root}/articles/${id}`).expect(404);
    await request(app)
      .delete(`${root}/admin/articles/${id}`)
      .set('Cookie', cookie('admin'))
      .set('Origin', origin)
      .expect(200);
    await put(`articles/${id}`, article).expect(404);
    const audit = await db.select().from(schema.auditLogs);
    expect(audit.some((row) => row.action === 'editorial.delete' && row.entityId === id)).toBe(
      true
    );
  });
  it('isolates each division and supports draft/unpublish without losing the selection', async () => {
    await put(`weekly-teams/${divisionA}`, team).expect(200);
    await put(`weekly-teams/${divisionB}`, {
      ...team,
      label: 'Beta week',
      published: false
    }).expect(200);
    expect((await request(app).get(`${root}/weekly-teams/${divisionA}`)).body.data.label).toBe(
      'Jornada 3'
    );
    expect((await request(app).get(`${root}/weekly-teams/${divisionB}`)).body.data).toBeNull();
    expect(
      (
        await request(app)
          .get(`${root}/admin/weekly-teams/${divisionB}`)
          .set('Cookie', cookie('admin'))
      ).body.data.label
    ).toBe('Beta week');
    await put(`weekly-teams/${divisionA}`, { ...team, published: false }).expect(200);
    expect((await request(app).get(`${root}/weekly-teams/${divisionA}`)).body.data).toBeNull();
  });
  it('validates content, image schemes, duplicate roles and missing divisions', async () => {
    await post({ ...article, title: ' ' }).expect(422);
    await post({ ...article, coverUrl: 'javascript:alert(1)' }).expect(422);
    await post({ ...article, coverUrl: 'https://example.com/image.jpg' }).expect(422);
    await post({ ...article, homeOrder: -1 }).expect(422);
    await put(`weekly-teams/${divisionA}`, {
      ...team,
      players: Array(5).fill(team.players[0])
    }).expect(422);
    await put(`weekly-teams/${divisionA}`, { ...team, players: team.players.slice(1) }).expect(422);
    await put('weekly-teams/cccccccc-cccc-4ccc-8ccc-cccccccccccc', team).expect(404);
  });
});
