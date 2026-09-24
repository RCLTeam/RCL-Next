export type EditorialKind = 'noticia' | 'reportaje' | 'entrevista' | 'otro';
export interface EditorialInput {
  title: string;
  excerpt: string;
  body: string;
  kind: EditorialKind;
  author: string;
  coverUrl: string;
  coverAlt: string;
  published: boolean;
  showOnHome: boolean;
  homeOrder: number;
}
export interface EditorialArticle extends EditorialInput {
  id: string;
  publishedAt: string | null;
  updatedAt: string;
}
export interface WeeklyPlayer {
  role: 'top' | 'jungle' | 'mid' | 'adc' | 'support';
  name: string;
  team: string;
  imageUrl: string;
}
export interface WeeklyTeamInput {
  label: string;
  published: boolean;
  players: WeeklyPlayer[];
}
export interface WeeklyTeam extends WeeklyTeamInput {
  divisionId: string;
  updatedAt: string;
}
