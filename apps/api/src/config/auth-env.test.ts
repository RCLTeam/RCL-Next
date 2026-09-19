import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './env.js';


const database = { DATABASE_URL: 'postgres://localhost/rcl' };
const configured = {
  ...database,
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_REDIRECT_URI: 'http://localhost:3001/api/v1/auth/discord/callback'
};

describe('Discord configuration', () => {
  it('allows disabled auth and complete local configuration', () => {
    expect(parseEnvironment(database).DISCORD_CLIENT_ID).toBe('');
    expect(parseEnvironment(configured).DISCORD_CLIENT_ID).toBe(configured.DISCORD_CLIENT_ID);
  });
  it('rejects partial configuration without exposing secrets', () => {
    expect(() => parseEnvironment({ ...database, DISCORD_CLIENT_SECRET: 'secret' })).toThrow(
      'DISCORD_CLIENT_ID'
    );
    expect(() => parseEnvironment({ ...configured, DISCORD_CLIENT_ID: 'invalid' })).toThrow(
      'DISCORD_CLIENT_ID'
    );
  });
  it('requires HTTPS in production and an exact callback path', () => {
    expect(() => parseEnvironment({ ...configured, NODE_ENV: 'production' })).toThrow(
      'CORS_ORIGIN'
    );
    expect(() =>
      parseEnvironment({ ...configured, DISCORD_REDIRECT_URI: 'https://api.example.com/wrong' })
    ).toThrow('DISCORD_REDIRECT_URI');
    expect(
      parseEnvironment({
        ...configured,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://rcl.example.com',
        DISCORD_REDIRECT_URI: 'https://api.example.com/api/v1/auth/discord/callback'
      }).NODE_ENV
    ).toBe('production');
  });
  it('rejects arbitrary schemes, URL credentials, paths and trailing slashes in the frontend origin', () => {
    for (const origin of [
      'javascript:alert(1)',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com/'
    ]) {
      expect(() => parseEnvironment({ ...configured, CORS_ORIGIN: origin })).toThrow('CORS_ORIGIN');
    }
  });
});
