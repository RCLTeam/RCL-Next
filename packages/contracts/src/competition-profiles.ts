export interface TeamSummary {
  slug?: string | undefined;
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
}
export interface TeamMember {
  playerSlug?: string | undefined;
  playerId?: string | null;
  id: string;
  name: string;
  role:
    | 'top'
    | 'jungle'
    | 'mid'
    | 'adc'
    | 'support'
    | 'substitute'
    | 'coach'
    | 'staff'
    | 'partners';
  isCaptain: boolean;
  gameName: string | null;
  riotTag: string | null;
  countryCode: string | null;
}
export interface TeamDetail extends TeamSummary {
  divisionId: string;
  color: string | null;
  isActive: boolean;
  seasonName: string;
  divisionName: string;
  members: TeamMember[];
}

export interface Player {
  competition?: {
    role: string | null;
    team: TeamSummary | null;
    champion: string | null;
    stats: PlayerStatistics | null;
    mvpMatchIds: string[];
    featured: { roundName: string; stats: PlayerStatistics } | null;
  };
  slug?: string | undefined;
  id: string;
  gameName: string;
  riotTag: string | null;
  countryCode: string | null;
  isMain: boolean;
  displayName: string | null;
}
export interface PlayerStatistics {
  games: number;
  kda: number;
  csPerMinute: number | null;
  killParticipation: number | null;
  winRate: number;
  damagePerMinute: number | null;
  visionScore: number | null;
  damageMitigated: number | null;
}
export interface PlayerTeam extends TeamSummary {
  seasonName: string;
  divisionName: string;
  role: TeamMember['role'];
  isCaptain: boolean;
  isActive: boolean;
}
export interface PlayerDetail extends Player {
  teams: PlayerTeam[];
}
