import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseEnvironment } from './env.js';

describe('parseEnvironment', () => {
  let initialEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    initialEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = initialEnv;
  });

  it('loads successfully with valid DATABASE_URL and returns default values', () => {
    Reflect.deleteProperty(process.env, 'PORT');
    Reflect.deleteProperty(process.env, 'HOST');
    Reflect.deleteProperty(process.env, 'CORS_ORIGIN');
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';

    const expectedNodeEnv = process.env.NODE_ENV ?? 'development';
    const config = parseEnvironment(process.env);

    expect(config.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/testdb');
    expect(config.PORT).toBe(3001);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.CORS_ORIGIN).toBe('http://localhost:5173');
    expect(config.NODE_ENV).toBe(expectedNodeEnv);
  });

  it('defaults NODE_ENV to development when NODE_ENV is not set', () => {
    Reflect.deleteProperty(process.env, 'NODE_ENV');
    Reflect.deleteProperty(process.env, 'PORT');
    Reflect.deleteProperty(process.env, 'HOST');
    Reflect.deleteProperty(process.env, 'CORS_ORIGIN');
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';

    const config = parseEnvironment(process.env);

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3001);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('loads successfully with custom PORT and NODE_ENV', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'production';
    // Production rejects the default http://localhost origin, with or without Discord sign-in.
    process.env.CORS_ORIGIN = 'https://rcl.example.com';

    const config = parseEnvironment(process.env);

    expect(config.PORT).toBe(4000);
    expect(config.NODE_ENV).toBe('production');
    expect(config.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/testdb');
  });

  it('throws an error when DATABASE_URL is missing', () => {
    Reflect.deleteProperty(process.env, 'DATABASE_URL');

    expect(() => parseEnvironment(process.env)).toThrow('Invalid environment: DATABASE_URL');
  });

  it('throws an error when DATABASE_URL has a non-postgres scheme', () => {
    process.env.DATABASE_URL = 'http://invalid';
    expect(() => parseEnvironment(process.env)).toThrow('Invalid environment: DATABASE_URL');

    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/testdb';
    expect(() => parseEnvironment(process.env)).toThrow('Invalid environment: DATABASE_URL');
  });

  it('throws an error when PORT is invalid', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';

    process.env.PORT = '99999';
    expect(() => parseEnvironment(process.env)).toThrow('Invalid environment: PORT');

    process.env.PORT = '-1';
    expect(() => parseEnvironment(process.env)).toThrow('Invalid environment: PORT');
  });
  describe('TRUST_PROXY', () => {
    const base = { DATABASE_URL: 'postgres://user:pass@localhost:5432/testdb' };

    it('defaults to trusting only loopback proxies', () => {
      expect(parseEnvironment({ ...base }).TRUST_PROXY).toBe('loopback');
    });

    it('accepts false, a hop count and address lists', () => {
      expect(parseEnvironment({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
      expect(parseEnvironment({ ...base, TRUST_PROXY: '' }).TRUST_PROXY).toBe(false);
      expect(parseEnvironment({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
      expect(
        parseEnvironment({ ...base, TRUST_PROXY: 'loopback, 10.0.0.0/8, ::1' }).TRUST_PROXY
      ).toBe('loopback,10.0.0.0/8,::1');
    });

    it.each(['true', 'everyone', '10.0.0.0/33', '300.1.1.1', 'loopback,'])(
      'rejects %s',
      (value) => {
        expect(() => parseEnvironment({ ...base, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
      }
    );
  });

  describe('settings independent of Discord sign-in', () => {
    const base = { DATABASE_URL: 'postgres://user:pass@localhost:5432/testdb' };

    it('rejects a non-WebSocket bridge URL without Discord credentials', () => {
      expect(() =>
        parseEnvironment({ ...base, DISCORD_BOT_WS_URL: 'http://localhost:8765' })
      ).toThrow('Invalid environment: DISCORD_BOT_WS_URL');
      expect(() => parseEnvironment({ ...base, DISCORD_BOT_WS_URL: 'not a url' })).toThrow(
        'DISCORD_BOT_WS_URL'
      );
      expect(
        parseEnvironment({ ...base, DISCORD_BOT_WS_URL: 'ws://127.0.0.1:8765/ws/bridge' })
          .DISCORD_BOT_WS_URL
      ).toBe('ws://127.0.0.1:8765/ws/bridge');
    });

    it('rejects an HTTP frontend origin in production without Discord credentials', () => {
      expect(() =>
        parseEnvironment({ ...base, NODE_ENV: 'production', CORS_ORIGIN: 'http://rcl.example.com' })
      ).toThrow('Invalid environment: CORS_ORIGIN');
      expect(() =>
        parseEnvironment({ ...base, CORS_ORIGIN: 'https://rcl.example.com/path' })
      ).toThrow('CORS_ORIGIN');
      expect(
        parseEnvironment({
          ...base,
          NODE_ENV: 'production',
          CORS_ORIGIN: 'https://rcl.example.com'
        }).CORS_ORIGIN
      ).toBe('https://rcl.example.com');
    });

    it('keeps the redirect URI optional while Discord sign-in is disabled', () => {
      expect(parseEnvironment(base).DISCORD_REDIRECT_URI).toBe('');
    });
  });

  describe('paths and public URL', () => {
    const base = { DATABASE_URL: 'postgres://user:pass@localhost:5432/testdb' };

    it('leaves the optional settings unset so their consumers keep their defaults', () => {
      const config = parseEnvironment(base);
      expect(config.FRONTEND_URL).toBeUndefined();
      expect(config.WEB_DIST_DIR).toBeUndefined();
      expect(config.TEAM_LOGO_DIR).toBeUndefined();
      expect(config.EDITORIAL_IMAGE_DIR).toBe('data/editorial-images');
    });

    it('passes the configured directories through unchanged', () => {
      const config = parseEnvironment({
        ...base,
        WEB_DIST_DIR: '/srv/rcl/web',
        TEAM_LOGO_DIR: '/srv/rcl/team-logos',
        EDITORIAL_IMAGE_DIR: '/srv/rcl/editorial-images'
      });
      expect(config.WEB_DIST_DIR).toBe('/srv/rcl/web');
      expect(config.TEAM_LOGO_DIR).toBe('/srv/rcl/team-logos');
      expect(config.EDITORIAL_IMAGE_DIR).toBe('/srv/rcl/editorial-images');
    });

    it('accepts an HTTP(S) frontend URL and rejects anything else', () => {
      expect(
        parseEnvironment({ ...base, FRONTEND_URL: 'https://preview.example.com/' }).FRONTEND_URL
      ).toBe('https://preview.example.com/');
      expect(parseEnvironment({ ...base, FRONTEND_URL: '' }).FRONTEND_URL).toBeUndefined();
      for (const value of ['undefined', 'ftp://example.com', 'javascript:alert(1)']) {
        expect(() => parseEnvironment({ ...base, FRONTEND_URL: value })).toThrow(
          'Invalid environment: FRONTEND_URL'
        );
      }
    });
  });

  it('accepts the set of variables defined by the production deployment', () => {
    // Same variable names as the production .env; every value is fictitious.
    const production = {
      DATABASE_URL: 'postgresql://rcl:secret@127.0.0.1:5432/rcl',
      POSTGRES_BIN_DIR: '/usr/lib/postgresql/16/bin',
      HOST: '127.0.0.1',
      PORT: '3001',
      CORS_ORIGIN: 'https://rcl.example.com',
      NODE_ENV: 'production',
      ALLOW_DEMO_SEED: 'false',
      DISCORD_CLIENT_ID: '123456789012345678',
      DISCORD_CLIENT_SECRET: 'client-secret',
      DISCORD_REDIRECT_URI: 'https://rcl.example.com/api/v1/auth/discord/callback',
      EDITORIAL_IMAGE_DIR: '/srv/rcl/editorial-images',
      DISCORD_BOT_WS_URL: 'ws://127.0.0.1:8765/ws/bridge',
      DISCORD_BOT_WS_SUPERTOKEN: 'bridge-supertoken',
      WEB_DIST_DIR: '/srv/rcl/apps/web/dist'
    };
    expect(Object.keys(production)).toHaveLength(14);

    const config = parseEnvironment(production);

    expect(config).toMatchObject({
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '127.0.0.1',
      CORS_ORIGIN: 'https://rcl.example.com',
      EDITORIAL_IMAGE_DIR: '/srv/rcl/editorial-images',
      WEB_DIST_DIR: '/srv/rcl/apps/web/dist',
      TRUST_PROXY: 'loopback'
    });
    expect(config.FRONTEND_URL).toBeUndefined();
    expect(config.TEAM_LOGO_DIR).toBeUndefined();
  });
});
