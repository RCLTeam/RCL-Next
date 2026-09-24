export interface ChampionStats {
  champion: string;
  games: number;
  wins: number;
  losses: number;
  totalGames: number;
  pickRate: number;
  winRate: number;
  /** Bans are not recorded by the current importer. */
  banRate: number | null;
}
