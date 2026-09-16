import type {
  MultiAccountAnomaly,
  ParsedGameData,
  PlayerLookupResult
} from '../types/roflUpload.types.js';

export function detectMultiAccountAnomalies(
  games: ParsedGameData[],
  playerCache: Map<string, PlayerLookupResult>
): MultiAccountAnomaly[] {
  const anomalies: MultiAccountAnomaly[] = [];

  for (const game of games) {
    const userMap = new Map<
      string,
      {
        discordUsername: string;
        accounts: { account: string; champion: string }[];
      }
    >();

    for (const participant of game.participants) {
      const key = `${participant.gameName.trim().toLowerCase()}#${participant.riotTag.trim().toLowerCase()}`;
      const lookup = playerCache.get(key);
      if (!lookup || !lookup.discordUserId) continue;

      const userEntry = userMap.get(lookup.discordUserId) ?? {
        discordUsername: lookup.discordUsername,
        accounts: []
      };

      userEntry.accounts.push({
        account: `${participant.gameName}#${participant.riotTag}`,
        champion: participant.champion
      });

      userMap.set(lookup.discordUserId, userEntry);
    }

    for (const [discordUserId, entry] of userMap.entries()) {
      if (entry.accounts.length > 1) {
        anomalies.push({
          gameFile: game.fileName,
          discordUserId,
          discordUsername: entry.discordUsername,
          accounts: entry.accounts
        });
      }
    }
  }

  return anomalies;
}
