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
  playerId?: string;
  teamId?: string;
  champions?: string[];
}
export interface WeeklyTeamInput {
  roundId: number;
  label: string;
  published: boolean;
  players: WeeklyPlayer[];
}
export interface WeeklyTeam extends Omit<WeeklyTeamInput, 'roundId'> {
  roundId: number | null;
  divisionId: string;
  updatedAt: string;
}

export interface WeeklyCandidate {
  playerId: string;
  teamId: string;
  memberId: string;
  name: string;
  team: string;
  tag: string | null;
  champions: string[];
  roles: WeeklyPlayer['role'][];
}
