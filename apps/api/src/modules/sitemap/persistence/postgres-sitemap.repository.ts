import { editorialArticles, players, seasonsDivisions, teams } from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type {
  SitemapArticleItem,
  SitemapPlayerItem,
  SitemapTeamItem
} from '../types/sitemap.types.js';
import type { SitemapRepository } from './sitemap.repository.js';

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export class PostgresSitemapRepository implements SitemapRepository {
  constructor(private readonly db: Database) {}

  async getTeams(): Promise<SitemapTeamItem[]> {
    const rows = await this.db
      .select({
        id: teams.id,
        name: teams.name,
        seasonName: seasonsDivisions.seasonName,
        divisionName: seasonsDivisions.divisionName,
        isActive: teams.isActive,
        updatedAt: teams.updatedAt,
        createdAt: teams.createdAt
      })
      .from(teams)
      .innerJoin(seasonsDivisions, eq(teams.seasonDivisionId, seasonsDivisions.id));

    return rows.map((row) => {
      const date = row.updatedAt ?? row.createdAt;
      return {
        id: row.id,
        name: row.name,
        seasonName: row.seasonName,
        divisionName: row.divisionName,
        isActive: row.isActive,
        updatedAt: date instanceof Date ? date : new Date(date)
      };
    });
  }

  async getPlayers(): Promise<SitemapPlayerItem[]> {
    const rows = await this.db
      .select({
        id: players.id,
        gameName: players.gameName,
        riotTag: players.riotTag,
        updatedAt: players.updatedAt,
        createdAt: players.createdAt
      })
      .from(players);

    return rows.map((row) => {
      const date = row.updatedAt ?? row.createdAt;
      return {
        id: row.id,
        gameName: row.gameName,
        riotTag: row.riotTag,
        updatedAt: date instanceof Date ? date : new Date(date)
      };
    });
  }

  async getArticles(): Promise<SitemapArticleItem[]> {
    const rows = await this.db
      .select({
        id: editorialArticles.id,
        updatedAt: editorialArticles.updatedAt
      })
      .from(editorialArticles)
      .where(eq(editorialArticles.published, true));

    return rows.map((row) => ({
      id: row.id,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)
    }));
  }
}
