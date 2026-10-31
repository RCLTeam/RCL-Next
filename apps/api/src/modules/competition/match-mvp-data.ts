import { matchGames, matches, playerGameInfo, playerGameStats, teams } from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { asc, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type MvpDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

// Shared by replay ingestion and historical backfill; positions always come from the replay.
export async function loadMatchMvpRows(tx: MvpDatabase, matchId: string) {
  const rows = await tx
    .select({
      playerId: playerGameInfo.playerId,
      gameId: matchGames.id,
      matchId: matches.id,
      divisionId: matches.idSeasonDivision,
      roundId: matches.idRound,
      teamId: playerGameInfo.teamId,
      team: { id: teams.id, name: teams.name, shortName: teams.shortName, logoUrl: teams.logoUrl },
      position: playerGameInfo.position,
      champion: playerGameInfo.champion,
      durationSeconds: matchGames.durationSeconds,
      winnerTeamId: matchGames.winnerTeamId,
      kills: playerGameStats.kills,
      deaths: playerGameStats.deaths,
      assists: playerGameStats.assists,
      cs: playerGameStats.cs,
      damageToChampions: playerGameStats.damageToChampions,
      goldEarned: playerGameStats.goldEarned,
      visionScore: playerGameStats.visionScore,
      damageMitigated: playerGameStats.damageMitigated
    })
    .from(matchGames)
    .innerJoin(matches, eq(matches.id, matchGames.matchesId))
    .innerJoin(playerGameInfo, eq(playerGameInfo.matchGameId, matchGames.id))
    .innerJoin(playerGameStats, eq(playerGameStats.id, playerGameInfo.id))
    .innerJoin(teams, eq(teams.id, playerGameInfo.teamId))
    .where(eq(matches.id, matchId))
    .orderBy(asc(matchGames.gameNumber), asc(playerGameInfo.playerId));
  return rows;
}
