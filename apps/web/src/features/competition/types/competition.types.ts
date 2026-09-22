// Public JSON shapes of the existing /api/v1 competition endpoints.
export interface Season {
  id: string;
  name: string;
}
export interface Division {
  id: string;
  seasonId: string;
  code: string;
  name: string;
  sortOrder: number;
}
export interface Team {
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
export interface TeamDetail extends Team {
  isActive: boolean;
  seasonName: string;
  divisionName: string;
  members: TeamMember[];
}

export interface Player {
  slug?: string | undefined;
  id: string;
  gameName: string;
  riotTag: string | null;
  countryCode: string | null;
  isMain: boolean;
  displayName: string | null;
}
export interface PlayerTeam extends Team {
  seasonName: string;
  divisionName: string;
  role: TeamMember['role'];
  isCaptain: boolean;
  isActive: boolean;
}
export interface PlayerDetail extends Player {
  teams: PlayerTeam[];
}
export interface Round {
  id: string;
  sequence: number;
  stage: string;
  name: string | null;
}
export interface Match {
  slug?: string | undefined;
  id: string;
  homeTeam?: Team;
  awayTeam?: Team;
  homeScore: number;
  awayScore: number;
  status: 'scheduled' | 'live' | 'completed' | 'forfeit' | 'cancelled';
  bestOf: number;
  scheduledAt: string | null;
  streamUrl: string | null;
  round: Round | null;
}
export interface Standing {
  position: number;
  team: Team;
  played: number;
  wins: number;
  losses: number;
  mapsWon: number;
  mapsLost: number;
  mapDifference: number;
}
export type CollectionState<T> =
  | { status: 'loading' | 'error'; data: T[] }
  | { status: 'ready'; data: T[] };
