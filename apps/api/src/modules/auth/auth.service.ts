import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../shared/app-error.js';
import type { AuthRepository, AuthUser } from './auth.repository.js';
import type { DiscordClient } from './discord.client.js';

export const STATE_LIFETIME_MS = 10 * 60 * 1000;
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const validToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly discord: DiscordClient
  ) {}

  async start(previousState?: string) {
    const now = new Date();
    await this.repository.deleteExpired(now);
    if (validToken(previousState)) await this.repository.consumeState(hash(previousState), now);
    const state = randomBytes(32).toString('hex');
    await this.repository.saveState(hash(state), new Date(now.getTime() + STATE_LIFETIME_MS));
    return { state, url: this.discord.authorizationUrl(state) };
  }

  async validateState(state: unknown, cookie: string | undefined) {
    if (
      !validToken(state) ||
      !validToken(cookie) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(cookie)) ||
      !(await this.repository.consumeState(hash(state), new Date()))
    ) {
      throw new AppError(
        400,
        'INVALID_OAUTH_STATE',
        'Sign-in expired or is invalid. Please start again.'
      );
    }
  }

  async login(code: string, previousSession?: string) {
    const profile = await this.discord.exchangeCode(code);
    const token = randomBytes(32).toString('hex');
    await this.repository.createSession(
      profile,
      hash(token),
      new Date(Date.now() + SESSION_LIFETIME_MS),
      validToken(previousSession) ? hash(previousSession) : undefined
    );
    return token;
  }

  async currentUser(token: string | undefined): Promise<AuthUser> {
    const user = validToken(token)
      ? await this.repository.findUser(hash(token), new Date())
      : undefined;
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign-in is required.');
    return user;
  }

  async logout(token?: string) {
    if (validToken(token)) await this.repository.deleteSession(hash(token));
  }
}
