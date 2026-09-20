export interface Season {
  id: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
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
  divisionId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  color: string | null;
  isActive: boolean;
}
export interface Round {
  id: string;
  divisionId: string;
  sequence: number;
  stage: string;
  name: string | null;
  startsAt: Date | null;
  lockAt: Date | null;
}
export interface Match {
  id: string;
  divisionId: string;
  roundId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  status: 'scheduled' | 'live' | 'completed' | 'forfeit' | 'cancelled';
  bestOf: number;
  scheduledAt: Date | null;
  finishedAt: Date | null;
  streamUrl: string | null;
}
export interface CompetitionRepository {
  seasons(): Promise<Season[]>;
  season(id: string): Promise<Season | undefined>;
  divisions(seasonId: string): Promise<Division[]>;
  division(id: string): Promise<Division | undefined>;
  teams(divisionId: string): Promise<Team[]>;
  rounds(divisionId: string): Promise<Round[]>;
  matches(divisionId: string): Promise<Match[]>;
}
