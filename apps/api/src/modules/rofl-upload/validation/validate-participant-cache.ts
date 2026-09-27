import type { RoflUploadRepository } from '../persistence/rofl-upload.repository.js';
import type { ParsedGameData, PlayerLookupResult } from '../types/rofl-upload.types.js';

export async function validateParticipantCache(
  games: ParsedGameData[],
  repository: RoflUploadRepository
): Promise<Map<string, PlayerLookupResult>> {
  const uniqueIdentities = new Map<string, { gameName: string; riotTag: string }>();

  for (const game of games) {
    for (const participant of game.participants) {
      const key = `${participant.gameName.trim().toLowerCase()}#${participant.riotTag.trim().toLowerCase()}`;
      if (!uniqueIdentities.has(key)) {
        uniqueIdentities.set(key, {
          gameName: participant.gameName.trim(),
          riotTag: participant.riotTag.trim()
        });
      }
    }
  }

  if (uniqueIdentities.size === 0) {
    return new Map<string, PlayerLookupResult>();
  }

  const queryIdentities = Array.from(uniqueIdentities.values());
  const foundPlayers = await repository.findPlayersByRiotIds(queryIdentities);

  const playerCache = new Map<string, PlayerLookupResult>();
  for (const player of foundPlayers) {
    const key = `${player.gameName.trim().toLowerCase()}#${player.riotTag.trim().toLowerCase()}`;
    playerCache.set(key, player);
  }

  const missingPlayers: string[] = [];
  for (const [key, identity] of uniqueIdentities.entries()) {
    if (!playerCache.has(key)) {
      missingPlayers.push(`${identity.gameName}#${identity.riotTag}`);
    }
  }

  if (missingPlayers.length > 0) {
    throw new Error(
      `Validation failed: The following summoners are not registered in the database: ${missingPlayers.join(', ')}`
    );
  }

  return playerCache;
}
