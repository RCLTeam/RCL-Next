import type {
  ExecuteBatchResult,
  ParsedGameData,
  PlayerLookupResult
} from '../types/rofl-upload.types.js';

export interface RoflUploadRepository {
  findPlayersByRiotIds(
    riotIds: { gameName: string; riotTag: string }[]
  ): Promise<PlayerLookupResult[]>;

  checkExternalGamesExist(externalGameIds: string[]): Promise<string[]>;

  findTeamMembershipsForDiscordUsers(discordUserIds: string[]): Promise<Map<string, string>>;

  findMatchForTeams(
    blueTeamId: string,
    redTeamId: string,
    gameDate?: Date
  ): Promise<{ matchId: string; isClosed: boolean } | null>;

  executeBatchInsert(
    games: ParsedGameData[],
    playerLookupMap: Map<string, PlayerLookupResult>,
    teamMap: Map<string, string>
  ): Promise<ExecuteBatchResult>;
}
