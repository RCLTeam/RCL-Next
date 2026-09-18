import { z } from 'zod';
import { AppError } from '../../shared/app-error.js';
import type { DiscordProfile } from './auth.repository.js';

export interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface DiscordClient {
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<DiscordProfile>;
}

const tokenSchema = z.object({ access_token: z.string().min(1), token_type: z.literal('Bearer') });
const profileSchema = z.object({
  id: z.string().regex(/^\d{17,20}$/),
  username: z.string().min(1).max(64),
  global_name: z.string().max(64).nullish(),
  avatar: z.string().max(128).nullish()
});

export class DiscordOAuthClient implements DiscordClient {
  constructor(
    private readonly config: DiscordConfig,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  authorizationUrl(state: string) {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'identify',
      state
    }).toString();
    return url.toString();
  }

  async exchangeCode(code: string): Promise<DiscordProfile> {
    try {
      const response = await this.fetcher('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.config.redirectUri
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error('Token exchange failed');
      const token = tokenSchema.parse(await response.json());
      const profileResponse = await this.fetcher('https://discord.com/api/v10/users/@me', {
        headers: { authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10000)
      });
      if (!profileResponse.ok) throw new Error('Profile request failed');
      const profile = profileSchema.parse(await profileResponse.json());
      return {
        discordId: profile.id,
        username: profile.username,
        globalName: profile.global_name ?? null,
        avatarHash: profile.avatar ?? null
      };
    } catch {
      // Never leak the provider response, code, client secret or access token.
      throw new AppError(502, 'DISCORD_UNAVAILABLE', 'Discord sign-in failed. Please try again.');
    }
  }
}
