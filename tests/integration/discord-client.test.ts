import { describe, expect, it, vi } from 'vitest';
import { DiscordOAuthClient } from '../../apps/api/src/modules/auth/discord.client.js';

describe('Discord provider failures', () => {
  it.each(['network', 'bad-token', 'profile-error', 'bad-profile'])(
    'sanitizes %s errors',
    async (failure) => {
      const fetcher = vi.fn<typeof fetch>();
      if (failure === 'network')
        fetcher.mockRejectedValueOnce(new Error('secret provider details'));
      else if (failure === 'bad-token') fetcher.mockResolvedValueOnce(new Response('{}'));
      else {
        fetcher.mockResolvedValueOnce(
          new Response(JSON.stringify({ token_type: 'Bearer', access_token: 'secret' }))
        );
        fetcher.mockResolvedValueOnce(
          failure === 'profile-error'
            ? new Response('secret diagnostics', { status: 503 })
            : new Response(JSON.stringify({ id: 'invalid', username: 'Invalid' }))
        );
      }
      const client = new DiscordOAuthClient(
        {
          clientId: '123456789012345678',
          clientSecret: 'secret',
          redirectUri: 'http://localhost:3001/api/v1/auth/discord/callback'
        },
        fetcher
      );
      await expect(client.exchangeCode('private-code')).rejects.toMatchObject({
        statusCode: 502,
        code: 'DISCORD_UNAVAILABLE',
        message: 'Discord sign-in failed. Please try again.'
      });
      expect(fetcher.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(
        true
      );
    }
  );
});
