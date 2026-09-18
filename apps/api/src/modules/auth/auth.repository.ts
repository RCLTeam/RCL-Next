export interface DiscordProfile {
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
}

export interface AuthUser extends DiscordProfile {
  role: 'viewer' | 'admin';
}

export interface AuthRepository {
  saveState(tokenHash: string, expiresAt: Date): Promise<void>;
  consumeState(tokenHash: string, now: Date): Promise<boolean>;
  createSession(
    profile: DiscordProfile,
    tokenHash: string,
    expiresAt: Date,
    previousHash?: string
  ): Promise<void>;
  findUser(tokenHash: string, now: Date): Promise<AuthUser | undefined>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}
