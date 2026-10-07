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

/**
 * Every team of the directory (active or not): slugs are disambiguated against the whole
 * directory, exactly as the competition API does, and only active teams are published.
 */
export interface SitemapTeamItem {
  id: string;
  name: string;
  seasonName: string;
  divisionName: string;
  isActive: boolean;
  updatedAt: Date;
}

export interface SitemapPlayerItem {
  id: string;
  gameName: string;
  riotTag: string | null;
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
