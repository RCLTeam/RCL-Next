import { editorialArticles, players, teams } from '@rcl/database';
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
        updatedAt: teams.updatedAt,
        createdAt: teams.createdAt
      })
      .from(teams)
      .where(eq(teams.isActive, true));

    return rows.map((row) => {
      const date = row.updatedAt ?? row.createdAt;
      return {
        id: row.id,
        updatedAt: date instanceof Date ? date : new Date(date)
      };
    });
  }

  async getPlayers(): Promise<SitemapPlayerItem[]> {
    const rows = await this.db
      .select({
        id: players.id,
        updatedAt: players.updatedAt,
        createdAt: players.createdAt
      })
      .from(players);

    return rows.map((row) => {
      const date = row.updatedAt ?? row.createdAt;
      return {
        id: row.id,
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
