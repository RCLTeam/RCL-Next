import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { type AuthOptions, requireAuth } from '../../apps/api/src/modules/auth/auth.router.js';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import { DiscordOAuthClient } from '../../apps/api/src/modules/auth/discord.client.js';
import { PostgresAuthRepository } from '../../apps/api/src/modules/auth/postgres-auth.repository.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import * as schema from '../../packages/database/src/schema.js';

const origin = 'http://localhost:5173';
const prefix = '/api/v1/auth';
const profile = {
  id: '123456789012345678',
  username: 'Player',
  global_name: 'Display',
  avatar: null
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function cookieHeaders(response: request.Response): string[] {
  return response.headers['set-cookie'] as unknown as string[];
}
function getCookie(response: request.Response, name: string) {
  const cookies = cookieHeaders(response);
  const value = cookies.find((entry) => entry.startsWith(`${name}=`));
  if (!value) throw new Error(`Missing cookie ${name}`);
  return value.split(';')[0] as string;
}

describe('Discord OAuth with real PostgreSQL sessions', () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const fetcher = vi.fn<typeof fetch>();
  const repository = new PostgresAuthRepository(db);
  const service = new AuthService(
    repository,
    new DiscordOAuthClient(
      {
        clientId: '987654321098765432',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3001/api/v1/auth/discord/callback'
      },
      fetcher
    )
  );
  const options: AuthOptions = { service, secureCookies: false, frontendOrigin: origin };
  const app = createApp({
    repository: new PostgresCompetitionRepository(db),
    checkDatabase: async () => {},
    corsOrigin: origin,
    auth: options
  });
  async function authorizeAdmin(session: string) {
    const handler = requireAuth(options, 'admin');
    const req = { headers: { cookie: session } } as Parameters<typeof handler>[0];
    const res = { locals: {} } as Parameters<typeof handler>[1];
    const next = vi.fn();
    await handler(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  }

  beforeAll(async () => {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
  });
  afterAll(() => client.close());

  async function begin() {
    const start = await request(app).get(`${prefix}/discord`).expect(302);
    const url = new URL(start.headers.location as string);
    return {
      state: url.searchParams.get('state') as string,
      cookie: getCookie(start, 'rcl_oauth_state'),
      start,
      url
    };
  }
  function mockDiscord(username = 'Player') {
    fetcher
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'private-token', token_type: 'Bearer' }))
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...profile, username })));
  }
  async function login(existingCookie?: string) {
    const flow = await begin();
    mockDiscord();
    const callback = await request(app)
      .get(`${prefix}/discord/callback`)
      .query({ state: flow.state, code: 'valid-code', returnTo: 'https://attacker.example' })
      .set('Cookie', existingCookie ? [flow.cookie, existingCookie] : [flow.cookie])
      .expect(302);
    return { callback, session: getCookie(callback, 'rcl_session'), flow };
  }

  it('requests only identify, sets browser-bound cookie, stores a hash and disables caching', async () => {
    const { state, start, url } = await begin();
    expect(url.origin).toBe('https://discord.com');
    expect(url.searchParams.get('scope')).toBe('identify');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(cookieHeaders(start)[0]).toContain('HttpOnly');
    expect(cookieHeaders(start)[0]).toContain('SameSite=Lax');
    expect(start.headers['cache-control']).toBe('no-store');
    expect(
      (
        await db
          .select()
          .from(schema.oauthStates)
          .where(eq(schema.oauthStates.tokenHash, hash(state)))
      ).length
    ).toBe(1);
  });

  it('logs in, uses form-encoded exchange, persists a viewer and exposes only profile data', async () => {
    const { callback, session } = await login();
    expect(callback.headers.location).toBe(origin);
    const response = await request(app)
      .get(`${prefix}/me`)
      .set('Cookie', session)
      .set('Origin', origin)
      .expect(200);
    expect(response.body.data).toEqual({
      discordId: profile.id,
      username: 'Player',
      globalName: 'Display',
      avatarHash: null,
      role: 'viewer'
    });
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    const tokenCall = fetcher.mock.calls.find(
      ([url]) => url === 'https://discord.com/api/oauth2/token'
    );
    expect(tokenCall?.[1]?.body).toBeInstanceOf(URLSearchParams);
    expect((tokenCall?.[1]?.body as URLSearchParams).get('client_secret')).toBe('test-secret');
    expect(JSON.stringify(response.body)).not.toContain('private-token');
    const rows = await db.select().from(schema.authSessions);
    expect(rows.some((row) => row.tokenHash === hash(session.split('=')[1] as string))).toBe(true);
    await expect(authorizeAdmin(session)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects missing cookies, mismatched, expired, repeated and concurrent states before contacting Discord', async () => {
    const flow = await begin();
    const calls = fetcher.mock.calls.length;
    await request(app)
      .get(`${prefix}/discord/callback`)
      .query({ state: flow.state, code: 'code' })
      .expect(400);
    await request(app)
      .get(`${prefix}/discord/callback`)
      .set('Cookie', flow.cookie)
      .query({ state: 'a'.repeat(64), code: 'code' })
      .expect(400);
    expect(fetcher.mock.calls.length).toBe(calls);
    await db
      .update(schema.oauthStates)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.oauthStates.tokenHash, hash(flow.state)));
    await request(app)
      .get(`${prefix}/discord/callback`)
      .set('Cookie', flow.cookie)
      .query({ state: flow.state, code: 'code' })
      .expect(400);
    const valid = await begin();
    const results = await Promise.allSettled([
      service.validateState(valid.state, valid.state),
      service.validateState(valid.state, valid.state)
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(service.validateState(valid.state, valid.state)).rejects.toMatchObject({
      code: 'INVALID_OAUTH_STATE'
    });
  });

  it('handles denied consent and missing codes without creating sessions', async () => {
    for (const query of [{ error: 'access_denied' }, {}]) {
      const flow = await begin();
      const result = await request(app)
        .get(`${prefix}/discord/callback`)
        .set('Cookie', flow.cookie)
        .query({ state: flow.state, ...query })
        .expect(400);
      expect(result.body.error.code).toBe(
        'error' in query ? 'DISCORD_ACCESS_DENIED' : 'INVALID_OAUTH_CODE'
      );
      expect(cookieHeaders(result)[0]).toContain('Expires=Thu, 01 Jan 1970');
    }
  });

  it('rejects callback replay and invalidates the previous flow when login restarts', async () => {
    const { flow } = await login();
    const calls = fetcher.mock.calls.length;
    await request(app)
      .get(`${prefix}/discord/callback`)
      .set('Cookie', flow.cookie)
      .query({ state: flow.state, code: 'valid-code' })
      .expect(400);
    expect(fetcher.mock.calls.length).toBe(calls);
    const pending = await begin();
    await request(app).get(`${prefix}/discord`).set('Cookie', pending.cookie).expect(302);
    await expect(service.validateState(pending.state, pending.state)).rejects.toMatchObject({
      code: 'INVALID_OAUTH_STATE'
    });
  });

  it('keeps public routes available when authentication is not configured', async () => {
    const disabled = createApp({
      repository: new PostgresCompetitionRepository(db),
      checkDatabase: async () => {},
      corsOrigin: origin
    });
    await request(disabled).get('/health/live').expect(200);
    const result = await request(disabled).get(`${prefix}/discord`).expect(503);
    expect(result.body.error.code).toBe('AUTH_NOT_CONFIGURED');
  });

  it('does not leak provider failures or issue a session on failure', async () => {
    const flow = await begin();
    fetcher.mockResolvedValueOnce(
      new Response('private provider diagnostics test-secret', { status: 400 })
    );
    const response = await request(app)
      .get(`${prefix}/discord/callback`)
      .set('Cookie', flow.cookie)
      .query({ state: flow.state, code: 'bad' })
      .expect(502);
    expect(response.body.error.code).toBe('DISCORD_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('test-secret');
    expect(cookieHeaders(response).some((value: string) => value.startsWith('rcl_session='))).toBe(
      false
    );
  });

  it('preserves admin roles on login, rotates sessions, and checks role changes immediately', async () => {
    const first = await login();
    await db
      .update(schema.discordUsers)
      .set({ role: 'admin' })
      .where(eq(schema.discordUsers.discordId, profile.id));
    const second = await login(first.session);
    expect(second.session).not.toBe(first.session);
    await request(app).get(`${prefix}/me`).set('Cookie', first.session).expect(401);
    await authorizeAdmin(second.session);
    await db
      .update(schema.discordUsers)
      .set({ role: 'viewer' })
      .where(eq(schema.discordUsers.discordId, profile.id));
    await expect(authorizeAdmin(second.session)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('requires a trusted origin for logout and revokes the server session', async () => {
    const { session } = await login();
    await request(app).get(`${prefix}/logout`).set('Cookie', session).expect(404);
    await request(app).post(`${prefix}/logout`).set('Cookie', session).expect(403);
    await request(app)
      .post(`${prefix}/logout`)
      .set('Cookie', session)
      .set('Origin', 'https://attacker.example')
      .expect(403);
    await request(app).get(`${prefix}/me`).set('Cookie', session).expect(200);
    const logout = await request(app)
      .post(`${prefix}/logout`)
      .set('Cookie', session)
      .set('Origin', origin)
      .expect(204);
    expect(cookieHeaders(logout)[0]).toContain('Expires=Thu, 01 Jan 1970');
    await request(app).get(`${prefix}/me`).set('Cookie', session).expect(401);
    await request(app).post(`${prefix}/logout`).set('Origin', origin).expect(204);
  });

  it('rejects missing, malformed, unknown and expired session cookies', async () => {
    await request(app).get(`${prefix}/me`).expect(401);
    for (const token of ['%invalid', 'b'.repeat(64)])
      await request(app).get(`${prefix}/me`).set('Cookie', `rcl_session=${token}`).expect(401);
    const { session } = await login();
    await db
      .update(schema.authSessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.authSessions.tokenHash, hash(session.split('=')[1] as string)));
    await request(app).get(`${prefix}/me`).set('Cookie', session).expect(401);
    await repository.deleteExpired(new Date());
    expect(
      (await db.select().from(schema.authSessions)).every((row) => row.expiresAt > new Date())
    ).toBe(true);
  });

  it('uses Secure host-only cookies over HTTPS', async () => {
    const secureApp = createApp({
      repository: new PostgresCompetitionRepository(db),
      checkDatabase: async () => {},
      corsOrigin: origin,
      auth: { ...options, secureCookies: true }
    });
    const start = await request(secureApp).get(`${prefix}/discord`).expect(302);
    expect(cookieHeaders(start)[0]).toMatch(/^__Host-rcl_oauth_state=/);
    expect(cookieHeaders(start)[0]).toContain('Secure');
    expect(cookieHeaders(start)[0]).not.toContain('Domain=');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    mockDiscord();
    const result = await request(secureApp)
      .get(`${prefix}/discord/callback`)
      .set('Cookie', getCookie(start, '__Host-rcl_oauth_state'))
      .query({ state, code: 'valid' })
      .expect(302);
    expect(getCookie(result, '__Host-rcl_session')).toBeTruthy();
  });

  it('revokes all sessions when their user is deleted', async () => {
    const { session } = await login();
    await db.delete(schema.discordUsers).where(eq(schema.discordUsers.discordId, profile.id));
    await request(app).get(`${prefix}/me`).set('Cookie', session).expect(401);
    expect(await db.select().from(schema.authSessions)).toHaveLength(0);
  });
});
