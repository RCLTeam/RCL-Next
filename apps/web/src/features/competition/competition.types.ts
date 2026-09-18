// Public JSON shapes of the existing /api/v1 competition endpoints.
export interface Season {
  id: string;
  name: string;
  isActive: boolean;
}
export interface Division {
  id: string;
  seasonId: string;
  code: string;
  name: string;
  sortOrder: number;
}
export interface Team {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
}
export interface Round {
  id: string;
  sequence: number;
  stage: string;
  name: string | null;
}
export interface Match {
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
