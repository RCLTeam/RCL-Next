export interface CrystalQuestion {
  id: string;
  label: string;
  category: 'qualification' | 'classification' | 'players' | 'meta';
  kind: 'team' | 'player' | 'champion' | 'integer' | 'duration' | 'choice';
  mode: 'manual' | 'automatic';
  count: number;
  divisionId?: string;
  options: {
    id: string;
    name: string;
    shortName?: string | null;
    imageUrl?: string | null;
    discordId?: string | null;
    avatarHash?: string | null;
  }[];
}
export type CrystalAnswers = Record<string, string[]>;
export interface CrystalBallData {
  season: string;
  divisionId: string;
  opensAt: string | null;
  closesAt: string | null;
  status: 'unconfigured' | 'upcoming' | 'open' | 'closed' | 'resolved';
  questions: CrystalQuestion[];
  results: CrystalAnswers;
  ranking: { userId: string; name: string; points: number }[];
}
