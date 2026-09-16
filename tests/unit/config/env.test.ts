import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../../apps/api/src/config/env.js';

describe('loadEnvironment', () => {
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
    const config = loadEnvironment();

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

    const config = loadEnvironment();

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3001);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('loads successfully with custom PORT and NODE_ENV', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'production';

    const config = loadEnvironment();

    expect(config.PORT).toBe(4000);
    expect(config.NODE_ENV).toBe('production');
    expect(config.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/testdb');
  });

  it('throws an error when DATABASE_URL is missing', () => {
    Reflect.deleteProperty(process.env, 'DATABASE_URL');

    expect(() => loadEnvironment()).toThrow('Invalid environment: DATABASE_URL');
  });

  it('throws an error when DATABASE_URL has a non-postgres scheme', () => {
    process.env.DATABASE_URL = 'http://invalid';
    expect(() => loadEnvironment()).toThrow('Invalid environment: DATABASE_URL');

    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/testdb';
    expect(() => loadEnvironment()).toThrow('Invalid environment: DATABASE_URL');
  });

  it('throws an error when PORT is invalid', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';

    process.env.PORT = '99999';
    expect(() => loadEnvironment()).toThrow('Invalid environment: PORT');

    process.env.PORT = '-1';
    expect(() => loadEnvironment()).toThrow('Invalid environment: PORT');
  });
});
