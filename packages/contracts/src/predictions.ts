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
  position: number;
  correct: number;
  total: number;
  points: number;
}
export interface PredictionsData {
  week: string;
  open: boolean;
  matches: PredictionSummary[];
  ranking: PredictorStanding[];
}
