export interface PlayerLookupResult {
  playerId: string;
  discordUserId: string;
  discordUsername: string;
  gameName: string;
  riotTag: string;
}

export interface ParticipantRunes {
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

export interface ParticipantBuild {
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

export interface ParsedParticipantData {
  gameName: string;
  riotTag: string;
  side: 'blue' | 'red';
  champion: string;
  position: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damageToChampions: number;
  visionScore: number | null;
  extraStats: Record<string, number | null | boolean>;
  runes: ParticipantRunes;
  build: ParticipantBuild;
}

export interface ParsedGameData {
  fileName: string;
  externalGameId: string;
  durationSeconds: number;
  winnerSide: 'blue' | 'red';
  participants: ParsedParticipantData[];
  gameCreation?: number;
}

export interface MultiAccountAnomaly {
  gameFile: string;
  discordUserId: string;
  discordUsername: string;
  accounts: { account: string; champion: string }[];
}

export interface BatchUploadResult {
  processedGames: number;
  detectedDiscordUsersCount: number;
  detectedPlayersCount: number;
  anomalies: MultiAccountAnomaly[];
  skippedDuplicates?: string[];
}

export interface ExecuteBatchResult {
  insertedGames: number;
  skippedDuplicates: string[];
}
