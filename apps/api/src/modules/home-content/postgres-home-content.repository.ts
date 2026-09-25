import type {
  EditorialInput,
  WeeklyCandidate,
  WeeklyPlayer,
  WeeklyTeamInput
} from '@rcl/contracts';
import {
  auditLogs,
  editorialArticles,
  homeWeeklyTeams,
  matchGames,
  matches,
  playerGameInfo,
  players,
  rounds,
  seasonsDivisions,
  teams
} from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { AppError, notFound } from '../../shared/app-error.js';
import type { HomeContentRepository } from './home-content.repository.js';

function weeklyRole(position: string | null): WeeklyPlayer['role'] | undefined {
  switch (position?.trim().toLowerCase()) {
    case 'top':
      return 'top';
    case 'jungle':
    case 'jgl':
    case 'jg':
      return 'jungle';
    case 'mid':
    case 'middle':
      return 'mid';
    case 'adc':
    case 'bot':
    case 'bottom':
      return 'adc';
    case 'support':
    case 'sup':
    case 'utility':
      return 'support';
    default:
      return undefined;
  }
}

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
  async removeUnusedImages(urls: string[], remove: (url: string) => Promise<void>) {
    if (!urls.length) return;
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE editorial_articles IN SHARE ROW EXCLUSIVE MODE`);
      const articles = await tx
        .select({ coverUrl: editorialArticles.coverUrl, body: editorialArticles.body })
        .from(editorialArticles);
      for (const url of new Set(urls)) {
        if (!articles.some((article) => article.coverUrl === url || article.body.includes(url)))
          await remove(url);
      }
    });
  }
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
  async weeklyCandidates(divisionId: string, roundId: number): Promise<WeeklyCandidate[]> {
    const rows = await this.db
      .select({
        playerId: players.id,
        memberId: players.discordUserId,
        name: players.gameName,
        tag: players.riotTag,
        teamId: teams.id,
        team: teams.name,
        champion: playerGameInfo.champion,
        position: playerGameInfo.position
      })
      .from(playerGameInfo)
      .innerJoin(players, eq(players.id, playerGameInfo.playerId))
      .innerJoin(teams, eq(teams.id, playerGameInfo.teamId))
      .innerJoin(matchGames, eq(matchGames.id, playerGameInfo.matchGameId))
      .innerJoin(matches, eq(matches.id, matchGames.matchesId))
      .where(and(eq(matches.idSeasonDivision, divisionId), eq(matches.idRound, roundId)))
      .orderBy(asc(teams.name), asc(players.gameName), asc(playerGameInfo.champion));
    const candidates = new Map<string, WeeklyCandidate>();
    for (const row of rows) {
      if (!row.champion.trim()) continue;
      const key = `${row.teamId}:${row.playerId}`;
      const candidate = candidates.get(key) ?? {
        ...row,
        memberId: row.memberId ?? row.playerId,
        champions: [],
        roles: []
      };
      if (!candidate.champions.includes(row.champion)) candidate.champions.push(row.champion);
      const role = weeklyRole(row.position);
      if (role && !candidate.roles.includes(role)) candidate.roles.push(role);
      candidates.set(key, candidate);
    }
    return [...candidates.values()].map(
      ({ playerId, teamId, memberId, name, team, tag, champions, roles }) => ({
        playerId,
        teamId,
        memberId,
        name,
        team,
        tag,
        champions,
        roles
      })
    );
  }
  async listWeeklyTeams(divisionId: string, admin: boolean) {
    const rows = await this.db
      .select()
      .from(homeWeeklyTeams)
      .where(
        and(
          eq(homeWeeklyTeams.divisionId, divisionId),
          admin
            ? undefined
            : and(eq(homeWeeklyTeams.published, true), isNotNull(homeWeeklyTeams.roundId))
        )
      )
      .orderBy(desc(homeWeeklyTeams.roundId), desc(homeWeeklyTeams.updatedAt));
    return Promise.all(
      rows.map(async (row) => {
        const team = teamDto(row);
        const candidates =
          row.roundId === null ? [] : await this.weeklyCandidates(divisionId, row.roundId);
        return {
          ...team,
          players: team.players.map((player) => ({
            ...player,
            champions:
              candidates.find(
                (item) => item.playerId === player.playerId && item.teamId === player.teamId
              )?.champions ?? []
          }))
        };
      })
    );
  }
  async getWeeklyTeam(divisionId: string) {
    return (await this.listWeeklyTeams(divisionId, true))[0] ?? null;
  }
  async saveWeeklyTeam(actor: string, divisionId: string, input: WeeklyTeamInput) {
    return this.db.transaction(async (tx) => {
      const [division] = await tx
        .select()
        .from(seasonsDivisions)
        .where(eq(seasonsDivisions.id, divisionId))
        .for('update');
      if (!division) throw notFound('Division');
      const [round] = await tx
        .select()
        .from(rounds)
        .where(and(eq(rounds.idSeasonDivision, divisionId), eq(rounds.id, input.roundId)))
        .for('share');
      if (!round) throw notFound('Round');
      const candidates = await new PostgresHomeContentRepository(tx).weeklyCandidates(
        divisionId,
        input.roundId
      );
      const memberIds = new Set<string>();
      const selected = input.players.map((player) => {
        const candidate = candidates.find(
          (item) => item.playerId === player.playerId && item.teamId === player.teamId
        );
        if (!candidate || !candidate.roles.includes(player.role))
          throw new AppError(
            422,
            'INVALID_WEEKLY_PLAYER',
            'Select a player recorded in this position during this round.'
          );
        if (memberIds.has(candidate.memberId))
          throw new AppError(
            422,
            'DUPLICATE_WEEKLY_PLAYER',
            'A player cannot occupy two positions.'
          );
        memberIds.add(candidate.memberId);
        return {
          role: player.role,
          playerId: candidate.playerId,
          teamId: candidate.teamId,
          name: candidate.name,
          team: candidate.team,
          champions: candidate.champions,
          imageUrl: ''
        };
      });
      const filter = and(
        eq(homeWeeklyTeams.divisionId, divisionId),
        eq(homeWeeklyTeams.roundId, input.roundId)
      );
      const [before] = await tx.select().from(homeWeeklyTeams).where(filter);
      const values = { ...input, players: selected, divisionId, updatedAt: new Date() };
      const [after] = await tx
        .insert(homeWeeklyTeams)
        .values(values)
        .onConflictDoUpdate({
          target: [homeWeeklyTeams.divisionId, homeWeeklyTeams.roundId],
          set: values
        })
        .returning();
      if (!after) throw notFound('Weekly team');
      await tx.insert(auditLogs).values({
        actorDiscordUserId: actor,
        action: 'weekly-team.update',
        entityType: 'home_weekly_teams',
        entityId: after.id,
        before,
        after
      });
      return teamDto(after);
    });
  }
}
