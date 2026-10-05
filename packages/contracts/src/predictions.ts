export interface PredictionPick {
  matchId: string;
  selectedTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}
export interface PredictionSummary {
  matchId: string;
  open: boolean;
  closed: boolean;
  homePercent: number | null;
  votes: number | null;
}
export interface PredictorStanding {
  userId: string;
  name: string;
  avatarHash: string | null;
  position: number;
  correct: number;
  total: number;
  points: number;
}
export interface PredictionsData {
  week: string;
  /** Round whose matches are listed; null when the division has no started round. */
  round: string | null;
  /** Latest round whose league week has started. */
  currentRound: string | null;
  open: boolean;
  matches: PredictionSummary[];
  ranking: PredictorStanding[];
}
