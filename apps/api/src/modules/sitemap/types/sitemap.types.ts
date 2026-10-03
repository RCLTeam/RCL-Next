export type SitemapChangeFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: SitemapChangeFrequency;
  priority?: number;
}

export type SitemapEntry = SitemapUrlEntry;

export interface SitemapTeamItem {
  id: string;
  updatedAt: Date;
}

export interface SitemapPlayerItem {
  id: string;
  updatedAt: Date;
}

export interface SitemapArticleItem {
  id: string;
  updatedAt: Date;
}

export interface SitemapConfig {
  baseUrl?: string;
  cacheTtlMs?: number;
}
