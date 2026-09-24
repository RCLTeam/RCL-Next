export type MatchStatKey =
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'cs'
  | 'damageToChampions'
  | 'visionScore'
  | 'doubleKills'
  | 'tripleKills'
  | 'quadraKills'
  | 'pentaKills'
  | 'largestKillingSpree'
  | 'goldEarned'
  | 'level'
  | 'damageTakenFromChampions'
  | 'damageMitigated'
  | 'crowdControlTime'
  | 'turretsKilled'
  | 'turretTakedowns'
  | 'inhibitorsKilled'
  | 'inhibitorTakedowns'
  | 'wardsPlaced'
  | 'wardsDestroyed'
  | 'controlWardsPurchased'
  | 'detectorWardsPlaced'
  | 'pings'
  | 'summonerSpell1Casts'
  | 'summonerSpell2Casts'
  | 'dragonsKilled'
  | 'baronsKilled'
  | 'riftHeraldsKilled'
  | 'voidGrubsKilled'
  | 'elderDragonsKilled'
  | 'objectivesStolen'
  | 'objectivesStolenAssists'
  | 'largestAbilityDamage'
  | 'largestAttackDamage'
  | 'largestCriticalStrike'
  | 'longestTimeLiving'
  | 'timeSpentDead';
export type MatchPlayerStats = Record<MatchStatKey, number | null> & { isMvp: boolean };
export interface MatchPlayerBuild {
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  trinket: number;
  summonerSpell1Id: number | null;
  summonerSpell2Id: number | null;
}
export interface MatchPlayerRunes {
  primaryKeystoneId: number;
  primaryPerk: number;
  primaryPerk1: number;
  primaryPerk2: number;
  primaryPerk3: number;
  secundaryRuneId: number;
  secundaryPerk1: number;
  secundaryPerk2: number;
  statPerkOffense: number;
  statPerkFlex: number;
  statPerkDefense: number;
}
export interface MatchParticipant {
  id: string;
  playerId: string;
  gameName: string;
  riotTag: string | null;
  teamId: string;
  side: 'blue' | 'red';
  champion: string;
  position: string | null;
  build: MatchPlayerBuild | null;
  stats: MatchPlayerStats | null;
  runes: MatchPlayerRunes | null;
}
export interface MatchMap {
  id: string;
  gameNumber: number;
  blueTeamId: string;
  redTeamId: string;
  winnerTeamId: string | null;
  durationSeconds: number | null;
  participants: MatchParticipant[];
}
export interface MatchDetail {
  id: string;
  slug?: string | undefined;
  homeScore: number;
  awayScore: number;
  status: 'completed' | 'forfeit';
  bestOf: number;
  winnerTeamId: string | null;
  seasonName: string;
  divisionName: string;
  roundName: string | null;
  homeTeam: { id: string; name: string; shortName: string | null; logoUrl: string | null };
  awayTeam: { id: string; name: string; shortName: string | null; logoUrl: string | null };
  games: MatchMap[];
}
