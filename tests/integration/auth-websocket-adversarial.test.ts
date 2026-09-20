import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import { DiscordOAuthClient } from '../../apps/api/src/modules/auth/discord.client.js';
import { PostgresAuthRepository } from '../../apps/api/src/modules/auth/postgres-auth.repository.js';
import type { RoflUploadRepository } from '../../apps/api/src/modules/rofl-upload/persistence/rofl-upload.repository.js';
import { attachRoflUploadGateway } from '../../apps/api/src/modules/rofl-upload/websocket/rofl-upload.gateway.js';
import type { RoflUploadGatewayOptions } from '../../apps/api/src/modules/rofl-upload/websocket/rofl-upload.gateway.js';
import * as schema from '../../packages/database/src/schema.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('Adversarial Security Verification', () => {
  let server: http.Server;
  let port: number;
  let authService: AuthService;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let client: PGlite;

  const stubRoflUploadRepo: RoflUploadRepository = {
    findPlayersByRiotIds: async () => [],
    checkExternalGamesExist: async () => [],
    findTeamMembershipsForDiscordUsers: async () => new Map(),
    findMatchForTeams: async () => null,
    executeBatchInsert: async () => ({ insertedGames: 0, skippedDuplicates: [] })
  };

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });

    const repo = new PostgresAuthRepository(db);
    authService = new AuthService(
      repo,
      new DiscordOAuthClient({ clientId: '', clientSecret: '', redirectUri: '' })
    );

    server = http.createServer();
    attachRoflUploadGateway(server, stubRoflUploadRepo, {
      authService
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    server.close();
    await client.close();
  });

  function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
    return new Promise((resolve) => {
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
  }

  describe('WebSocket Gateway Auth Gate', () => {
    it('closes with 4001 if no cookie is provided', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`);
      const { code } = await waitForClose(ws);
      expect(code).toBe(4001);
    });

    it('closes with 4001 if cookie is invalid', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
        headers: { cookie: 'rcl_session=invalid' }
      });
      const { code } = await waitForClose(ws);
      expect(code).toBe(4001);
    });

    it('closes with 4003 if user is not admin', async () => {
      const token = 'a'.repeat(64);
      await db.insert(schema.discordUsers).values({
        discordId: 'user1',
        username: 'viewer1',
        role: 'viewer',
        globalName: null,
        avatarHash: null
      });
      // biome-ignore lint/complexity/useLiteralKeys: private access
      await authService['repository'].createSession(
        { discordId: 'user1', username: 'viewer1', globalName: null, avatarHash: null },
        hash(token),
        new Date(Date.now() + 10000)
      );

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
        headers: { cookie: `rcl_session=${token}` }
      });
      const { code } = await waitForClose(ws);
      expect(code).toBe(4003);
    });

    it('closes with 4001 if cookie header has arbitrary other keys without rcl_session', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
        headers: { cookie: 'other_cookie=xyz; foo=bar; theme=dark' }
      });
      const { code } = await waitForClose(ws);
      expect(code).toBe(4001);
    });

    it('closes with 4001 if cookie has rcl_session key with empty value', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
        headers: { cookie: 'rcl_session=; theme=dark' }
      });
      const { code } = await waitForClose(ws);
      expect(code).toBe(4001);
    });

    it('connects successfully if user is admin', async () => {
      const token = 'b'.repeat(64);
      await db.insert(schema.discordUsers).values({
        discordId: 'admin1',
        username: 'admin1',
        role: 'admin',
        globalName: null,
        avatarHash: null
      });
      // biome-ignore lint/complexity/useLiteralKeys: private access
      await authService['repository'].createSession(
        { discordId: 'admin1', username: 'admin1', globalName: null, avatarHash: null },
        hash(token),
        new Date(Date.now() + 60000)
      );

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
        headers: { cookie: `rcl_session=${token}` }
      });

      await new Promise<void>((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('connects successfully with __Host-rcl_session cookie for admin user', async () => {
      const token = 'e'.repeat(64);
      await db.insert(schema.discordUsers).values({
        discordId: 'admin_host',
        username: 'admin_host',
        role: 'admin',
        globalName: null,
        avatarHash: null
      });
      // biome-ignore lint/complexity/useLiteralKeys: private access
      await authService['repository'].createSession(
        { discordId: 'admin_host', username: 'admin_host', globalName: null, avatarHash: null },
        hash(token),
        new Date(Date.now() + 60000)
      );

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
        headers: { cookie: `__Host-rcl_session=${token}` }
      });

      await new Promise<void>((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('connects successfully when rcl_session is first among multiple cookies', async () => {
      const token = 'f'.repeat(64);
      await db.insert(schema.discordUsers).values({
        discordId: 'admin_multi1',
        username: 'admin_multi1',
        role: 'admin',
        globalName: null,
        avatarHash: null
      });
      // biome-ignore lint/complexity/useLiteralKeys: private access
      await authService['repository'].createSession(
        { discordId: 'admin_multi1', username: 'admin_multi1', globalName: null, avatarHash: null },
        hash(token),
        new Date(Date.now() + 60000)
      );

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
        headers: { cookie: `rcl_session=${token}; theme=dark; analytics_id=12345` }
      });

      await new Promise<void>((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('connects successfully when rcl_session is in the middle of multiple cookies', async () => {
      const token = '1'.repeat(64);
      await db.insert(schema.discordUsers).values({
        discordId: 'admin_multi2',
        username: 'admin_multi2',
        role: 'admin',
        globalName: null,
        avatarHash: null
      });
      // biome-ignore lint/complexity/useLiteralKeys: private access
      await authService['repository'].createSession(
        { discordId: 'admin_multi2', username: 'admin_multi2', globalName: null, avatarHash: null },
        hash(token),
        new Date(Date.now() + 60000)
      );

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
        headers: { cookie: `pref=compact; rcl_session=${token}; theme=dark` }
      });

      await new Promise<void>((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('connects successfully when rcl_session is last among multiple cookies', async () => {
      const token = '2'.repeat(64);
      await db.insert(schema.discordUsers).values({
        discordId: 'admin_multi3',
        username: 'admin_multi3',
        role: 'admin',
        globalName: null,
        avatarHash: null
      });
      // biome-ignore lint/complexity/useLiteralKeys: private access
      await authService['repository'].createSession(
        { discordId: 'admin_multi3', username: 'admin_multi3', globalName: null, avatarHash: null },
        hash(token),
        new Date(Date.now() + 60000)
      );

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`, {
        headers: { cookie: `pref=compact; theme=dark; rcl_session=${token}` }
      });

      await new Promise<void>((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('backward compatibility: allows connection without cookies when gateway is configured without authService', async () => {
      const unauthServer = http.createServer();
      attachRoflUploadGateway(unauthServer, stubRoflUploadRepo);

      let unauthPort = 0;
      await new Promise<void>((resolve) => {
        unauthServer.listen(0, '127.0.0.1', () => {
          unauthPort = (unauthServer.address() as AddressInfo).port;
          resolve();
        });
      });

      try {
        const ws = new WebSocket(`ws://127.0.0.1:${unauthPort}/ws/rofl-upload`);
        await new Promise<void>((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
        });
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
      } finally {
        await new Promise<void>((resolve) => unauthServer.close(() => resolve()));
      }
    });
  });

  describe('RangeError in timingSafeEqual', () => {
    it('returns false/throws 400 instead of 500 when lengths mismatch', async () => {
      // Create a valid state
      const token = 'c'.repeat(64);
      // biome-ignore lint/complexity/useLiteralKeys: private access
      await authService['repository'].saveState(hash(token), new Date(Date.now() + 10000));

      // Attempt to validate with mismatched length
      const cookie = 'd'.repeat(63); // One char shorter
      // biome-ignore lint/suspicious/noExplicitAny: test error capture
      let error: any;
      try {
        await authService.validateState(token, cookie);
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.status).toBe(400); // AppError status 400, NOT a RangeError 500
    });
  });
});
