import type {
  SitemapArticleItem,
  SitemapPlayerItem,
  SitemapTeamItem
} from '../types/sitemap.types.js';

export interface SitemapRepository {
  getTeams(): Promise<SitemapTeamItem[]>;
  getPlayers(): Promise<SitemapPlayerItem[]>;
  getArticles(): Promise<SitemapArticleItem[]>;
}
