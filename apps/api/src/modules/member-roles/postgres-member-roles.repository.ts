import type { ChangeMemberRole } from '@rcl/contracts';
import { auditLogs, discordUsers } from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { asc, eq, ilike, or, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { AppError, notFound } from '../../shared/app-error.js';
import type { MemberRolesRepository } from './member-roles.repository.js';

const selection = {
  discordId: discordUsers.discordId,
  username: discordUsers.username,
  globalName: discordUsers.globalName,
  role: discordUsers.role
};
export class PostgresMemberRolesRepository implements MemberRolesRepository {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>) {}
  async list(search: string, offset: number) {
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await this.db
      .select(selection)
      .from(discordUsers)
      .where(
        search
          ? or(
              ilike(discordUsers.username, pattern),
              ilike(discordUsers.globalName, pattern),
              ilike(discordUsers.discordId, pattern)
            )
          : undefined
      )
      .orderBy(asc(discordUsers.username), asc(discordUsers.discordId))
      .limit(51)
      .offset(offset);
    return { members: rows.slice(0, 50), hasMore: rows.length > 50 };
  }
  async changeRole(actorId: string, memberId: string, change: ChangeMemberRole) {
    return this.db.transaction(async (tx) => {
      // Role changes are rare. Serialize writes, including concurrent owner demotions,
      // and recheck the actor within the same transaction as the update and audit.
      await tx.execute(sql`LOCK TABLE ${discordUsers} IN SHARE ROW EXCLUSIVE MODE`);
      const [actor] = await tx
        .select(selection)
        .from(discordUsers)
        .where(eq(discordUsers.discordId, actorId));
      if (actor?.role !== 'owner')
        throw new AppError(403, 'FORBIDDEN', 'Only an owner can manage member roles.');
      const [before] = await tx
        .select(selection)
        .from(discordUsers)
        .where(eq(discordUsers.discordId, memberId));
      if (!before) throw notFound('Member');
      if (before.role !== change.expectedRole)
        throw new AppError(409, 'ROLE_CHANGED', 'This role changed. Reload the member list.');
      if (before.role === change.role) return before;
      if (before.role === 'owner' && change.role !== 'owner') {
        const owners = await tx
          .select({ id: discordUsers.discordId })
          .from(discordUsers)
          .where(eq(discordUsers.role, 'owner'))
          .limit(2);
        if (owners.length < 2)
          throw new AppError(
            409,
            'LAST_OWNER',
            'The last owner cannot be demoted. Assign another owner first.'
          );
      }
      const [after] = await tx
        .update(discordUsers)
        .set({ role: change.role })
        .where(eq(discordUsers.discordId, memberId))
        .returning(selection);
      if (!after) throw notFound('Member');
      await tx.insert(auditLogs).values({
        actorDiscordUserId: actorId,
        action: 'member-roles.update',
        entityType: 'discord_users',
        before,
        after
      });
      return after;
    });
  }
}
