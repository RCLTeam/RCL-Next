import { authSessions, discordUsers, oauthStates } from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { and, eq, gt, lte } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { AuthRepository, DiscordProfile } from './auth.repository.js';

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>) {}

  async saveState(tokenHash: string, expiresAt: Date) {
    await this.db.insert(oauthStates).values({ tokenHash, expiresAt });
  }

  async consumeState(tokenHash: string, now: Date) {
    const rows = await this.db
      .delete(oauthStates)
      .where(and(eq(oauthStates.tokenHash, tokenHash), gt(oauthStates.expiresAt, now)))
      .returning({ tokenHash: oauthStates.tokenHash });
    return rows.length === 1;
  }

  async createSession(
    profile: DiscordProfile,
    tokenHash: string,
    expiresAt: Date,
    previousHash?: string
  ) {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(discordUsers)
        .values(profile)
        .onConflictDoUpdate({
          target: discordUsers.discordId,
          // OAuth only updates profile data. Application roles are managed separately.
          set: {
            username: profile.username,
            globalName: profile.globalName,
            avatarHash: profile.avatarHash,
            updatedAt: new Date()
          }
        });
      if (previousHash)
        await tx.delete(authSessions).where(eq(authSessions.tokenHash, previousHash));
      await tx
        .insert(authSessions)
        .values({ tokenHash, discordUserId: profile.discordId, expiresAt });
    });
  }

  async findUser(tokenHash: string, now: Date) {
    const rows = await this.db
      .select({
        discordId: discordUsers.discordId,
        username: discordUsers.username,
        globalName: discordUsers.globalName,
        avatarHash: discordUsers.avatarHash,
        role: discordUsers.role
      })
      .from(authSessions)
      .innerJoin(discordUsers, eq(authSessions.discordUserId, discordUsers.discordId))
      .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now)))
      .limit(1);
    return rows[0];
  }

  async deleteSession(tokenHash: string) {
    await this.db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
  }

  async deleteExpired(now: Date) {
    await this.db.delete(oauthStates).where(lte(oauthStates.expiresAt, now));
    await this.db.delete(authSessions).where(lte(authSessions.expiresAt, now));
  }
}
