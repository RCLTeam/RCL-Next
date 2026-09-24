import type { EditorialInput, WeeklyTeamInput } from '@rcl/contracts';
import { auditLogs, editorialArticles, homeWeeklyTeams, seasonsDivisions } from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { notFound } from '../../shared/app-error.js';
import type { HomeContentRepository } from './home-content.repository.js';

const articleDto = (row: typeof editorialArticles.$inferSelect) => ({
  ...row,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString()
});
const teamDto = (row: typeof homeWeeklyTeams.$inferSelect) => ({
  ...row,
  updatedAt: row.updatedAt.toISOString()
});

export class PostgresHomeContentRepository implements HomeContentRepository {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>) {}
  async listArticles(admin: boolean) {
    const rows = await this.db
      .select()
      .from(editorialArticles)
      .where(
        admin
          ? undefined
          : and(eq(editorialArticles.published, true), eq(editorialArticles.showOnHome, true))
      )
      .orderBy(
        asc(editorialArticles.homeOrder),
        desc(editorialArticles.publishedAt),
        asc(editorialArticles.id)
      );
    return rows.map(articleDto);
  }
  async getArticle(id: string) {
    const [row] = await this.db
      .select()
      .from(editorialArticles)
      .where(eq(editorialArticles.id, id));
    return row ? articleDto(row) : null;
  }
  async saveArticle(actor: string, id: string | null, input: EditorialInput) {
    return this.db.transaction(async (tx) => {
      const [before] = id
        ? await tx
            .select()
            .from(editorialArticles)
            .where(eq(editorialArticles.id, id))
            .for('update')
        : [];
      if (id && !before) throw notFound('Article');
      const values = {
        ...input,
        updatedAt: new Date(),
        publishedAt: before?.publishedAt ?? (input.published ? new Date() : null)
      };
      const [after] = id
        ? await tx
            .update(editorialArticles)
            .set(values)
            .where(eq(editorialArticles.id, id))
            .returning()
        : await tx.insert(editorialArticles).values(values).returning();
      if (!after) throw notFound('Article');
      await tx.insert(auditLogs).values({
        actorDiscordUserId: actor,
        action: id ? 'editorial.update' : 'editorial.create',
        entityType: 'editorial_articles',
        entityId: after.id,
        before,
        after
      });
      return articleDto(after);
    });
  }
  async deleteArticle(actor: string, id: string) {
    await this.db.transaction(async (tx) => {
      const [before] = await tx
        .delete(editorialArticles)
        .where(eq(editorialArticles.id, id))
        .returning();
      if (!before) throw notFound('Article');
      await tx.insert(auditLogs).values({
        actorDiscordUserId: actor,
        action: 'editorial.delete',
        entityType: 'editorial_articles',
        entityId: id,
        before
      });
    });
  }
  async getWeeklyTeam(divisionId: string) {
    const [row] = await this.db
      .select()
      .from(homeWeeklyTeams)
      .where(eq(homeWeeklyTeams.divisionId, divisionId));
    return row ? teamDto(row) : null;
  }
  async saveWeeklyTeam(actor: string, divisionId: string, input: WeeklyTeamInput) {
    return this.db.transaction(async (tx) => {
      const [division] = await tx
        .select()
        .from(seasonsDivisions)
        .where(eq(seasonsDivisions.id, divisionId))
        .for('update');
      if (!division) throw notFound('Division');
      const [before] = await tx
        .select()
        .from(homeWeeklyTeams)
        .where(eq(homeWeeklyTeams.divisionId, divisionId));
      const values = { ...input, divisionId, updatedAt: new Date() };
      const [after] = await tx
        .insert(homeWeeklyTeams)
        .values(values)
        .onConflictDoUpdate({ target: homeWeeklyTeams.divisionId, set: values })
        .returning();
      if (!after) throw notFound('Weekly team');
      await tx.insert(auditLogs).values({
        actorDiscordUserId: actor,
        action: 'weekly-team.update',
        entityType: 'home_weekly_teams',
        entityId: divisionId,
        before,
        after
      });
      return teamDto(after);
    });
  }
}
