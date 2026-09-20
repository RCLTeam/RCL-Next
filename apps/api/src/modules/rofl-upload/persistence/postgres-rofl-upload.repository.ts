import crypto from 'node:crypto';
import {
  discordUsers,
  matchGames,
  matches,
  playerGameBuild,
  playerGameInfo,
  playerGameRunes,
  playerGameStats,
  players,
  teamMemberships
} from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type {
  ExecuteBatchResult,
  ParsedGameData,
  PlayerLookupResult
} from '../types/rofl-upload.types.js';
import type { RoflUploadRepository } from './rofl-upload.repository.js';

interface MatchTrackingState {
  team1Id: string;
  team2Id: string;
  bestOf: number;
  team1Score: number;
  team2Score: number;
}

type DatabaseExecutor =
  | PgDatabase<PgQueryResultHKT, typeof schema>
  | Parameters<Parameters<PgDatabase<PgQueryResultHKT, typeof schema>['transaction']>[0]>[0];

type NewPlayerGameInfo = typeof playerGameInfo.$inferInsert;
type NewPlayerGameStats = typeof playerGameStats.$inferInsert;
type NewPlayerGameRunes = typeof playerGameRunes.$inferInsert;
type NewPlayerGameBuild = typeof playerGameBuild.$inferInsert;

export class PostgresRoflUploadRepository implements RoflUploadRepository {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>) {}

  async findPlayersByRiotIds(
    riotIds: { gameName: string; riotTag: string }[]
  ): Promise<PlayerLookupResult[]> {
    if (riotIds.length === 0) return [];
    const conditions = riotIds.map((r) =>
      and(
        sql`LOWER(${players.gameName}) = LOWER(${r.gameName})`,
        sql`LOWER(${players.riotTag}) = LOWER(${r.riotTag})`
      )
    );
    const rows = await this.db
      .select({
        playerId: players.id,
        discordUserId: players.discordUserId,
        gameName: players.gameName,
        riotTag: players.riotTag,
        discordUsername: discordUsers.username
      })
      .from(players)
      .innerJoin(discordUsers, eq(players.discordUserId, discordUsers.discordId))
      .where(or(...conditions));

    return rows.map((r) => ({
      playerId: r.playerId,
      discordUserId: r.discordUserId ?? '',
      discordUsername: r.discordUsername,
      gameName: r.gameName,
      riotTag: r.riotTag ?? ''
    }));
  }

  async checkExternalGamesExist(externalGameIds: string[]): Promise<string[]> {
    if (externalGameIds.length === 0) return [];
    const rows = await this.db
      .select({ externalGameId: matchGames.externalGameId })
      .from(matchGames)
      .where(inArray(matchGames.externalGameId, externalGameIds));
    return rows.map((r) => r.externalGameId).filter((id): id is string => id !== null);
  }

  async findTeamMembershipsForDiscordUsers(discordUserIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (discordUserIds.length === 0) return map;
    const rows = await this.db
      .select({
        discordUserId: teamMemberships.discordUserId,
        teamId: teamMemberships.teamId
      })
      .from(teamMemberships)
      .where(inArray(teamMemberships.discordUserId, discordUserIds));
    for (const r of rows) {
      map.set(r.discordUserId, r.teamId);
    }
    return map;
  }

  async findMatchForTeams(
    blueTeamId: string,
    redTeamId: string,
    gameDate?: Date,
    executor: DatabaseExecutor = this.db
  ): Promise<{ matchId: string; isClosed: boolean } | null> {
    // 1. Primary search: open/live/scheduled match between both teams
    const openRows = await executor
      .select({ id: matches.id, status: matches.status })
      .from(matches)
      .where(
        and(
          or(
            and(eq(matches.team1Id, blueTeamId), eq(matches.team2Id, redTeamId)),
            and(eq(matches.team1Id, redTeamId), eq(matches.team2Id, blueTeamId))
          ),
          inArray(matches.status, ['scheduled', 'live'])
        )
      )
      .limit(1);

    if (openRows[0]) {
      return { matchId: openRows[0].id, isClosed: false };
    }

    // 2. Secondary search: weekly round window checking completed status
    if (gameDate) {
      const searchStart = new Date(gameDate.getTime() - 9 * 86400000);
      const searchEnd = new Date(gameDate.getTime() + 9 * 86400000);

      const weekRows = await executor
        .select({ id: matches.id, status: matches.status, scheduledAt: matches.scheduledAt })
        .from(matches)
        .where(
          and(
            or(
              and(eq(matches.team1Id, blueTeamId), eq(matches.team2Id, redTeamId)),
              and(eq(matches.team1Id, redTeamId), eq(matches.team2Id, blueTeamId))
            ),
            sql`${matches.scheduledAt} >= ${searchStart} AND ${matches.scheduledAt} <= ${searchEnd}`
          )
        );

      const validMatches = weekRows.filter(
        (curr): curr is (typeof weekRows)[number] & { scheduledAt: Date } => {
          if (!curr.scheduledAt) return false;
          const mDay = curr.scheduledAt.getUTCDay();
          const mDiffToMonday = (mDay === 0 ? -6 : 1) - mDay;
          const matchRoundMonday = new Date(curr.scheduledAt);
          matchRoundMonday.setUTCDate(curr.scheduledAt.getUTCDate() + mDiffToMonday);
          matchRoundMonday.setUTCHours(0, 0, 0, 0);

          const matchWindowStart = new Date(matchRoundMonday);
          matchWindowStart.setUTCDate(matchRoundMonday.getUTCDate() - 1);
          matchWindowStart.setUTCHours(0, 0, 0, 0);

          const matchWindowEnd = new Date(matchRoundMonday);
          matchWindowEnd.setUTCDate(matchRoundMonday.getUTCDate() + 7);
          matchWindowEnd.setUTCHours(23, 59, 59, 999);

          return gameDate >= matchWindowStart && gameDate <= matchWindowEnd;
        }
      );

      if (validMatches.length > 0) {
        // Pick the match closest to the replay timestamp
        const closest = validMatches.reduce((best, curr) => {
          const bestDiff = Math.abs(best.scheduledAt.getTime() - gameDate.getTime());
          const currDiff = Math.abs(curr.scheduledAt.getTime() - gameDate.getTime());
          return currDiff < bestDiff ? curr : best;
        });
        return {
          matchId: closest.id,
          isClosed: closest.status === 'completed'
        };
      }
    }

    return null;
  }

  async executeBatchInsert(
    games: ParsedGameData[],
    playerLookupMap: Map<string, PlayerLookupResult>,
    teamMap: Map<string, string>
  ): Promise<ExecuteBatchResult> {
    const externalIds = games
      .map((g) => g.externalGameId)
      .filter((id): id is string => Boolean(id));
    const existingIds = await this.checkExternalGamesExist(externalIds);
    const existingSet = new Set(existingIds);
    const seenInBatch = new Set<string>();
    const skippedDuplicates: string[] = [];
    let insertedGames = 0;

    await this.db.transaction(async (tx) => {
      const matchStateMap = new Map<string, MatchTrackingState>();
      const gameNumberMap = new Map<string, number>();

      for (const game of games) {
        if (
          game.externalGameId &&
          (existingSet.has(game.externalGameId) || seenInBatch.has(game.externalGameId))
        ) {
          skippedDuplicates.push(game.externalGameId);
          continue;
        }

        if (game.externalGameId) {
          seenInBatch.add(game.externalGameId);
        }

        const blueParticipants = game.participants.filter((p) => p.side === 'blue');
        const redParticipants = game.participants.filter((p) => p.side === 'red');

        if (blueParticipants.length === 0 || redParticipants.length === 0) {
          throw new Error(`Game ${game.fileName} does not contain participants for both sides`);
        }

        // Validate unanimous team membership on blue side
        const bluePlayerTeams: Array<{ player: string; teamId: string }> = [];
        const blueTeamIds = new Set<string>();
        for (const p of blueParticipants) {
          const key = `${p.gameName.toLowerCase()}#${p.riotTag.toLowerCase()}`;
          const lookup = playerLookupMap.get(key);
          if (!lookup) {
            throw new Error(`Player not found: ${p.gameName}#${p.riotTag}`);
          }
          const teamId = teamMap.get(lookup.discordUserId);
          if (!teamId) {
            throw new Error(
              `Team membership not found for player ${p.gameName}#${p.riotTag} (${lookup.discordUserId})`
            );
          }
          blueTeamIds.add(teamId);
          bluePlayerTeams.push({ player: `${p.gameName}#${p.riotTag}`, teamId });
        }

        // Validate unanimous team membership on red side
        const redPlayerTeams: Array<{ player: string; teamId: string }> = [];
        const redTeamIds = new Set<string>();
        for (const p of redParticipants) {
          const key = `${p.gameName.toLowerCase()}#${p.riotTag.toLowerCase()}`;
          const lookup = playerLookupMap.get(key);
          if (!lookup) {
            throw new Error(`Player not found: ${p.gameName}#${p.riotTag}`);
          }
          const teamId = teamMap.get(lookup.discordUserId);
          if (!teamId) {
            throw new Error(
              `Team membership not found for player ${p.gameName}#${p.riotTag} (${lookup.discordUserId})`
            );
          }
          redTeamIds.add(teamId);
          redPlayerTeams.push({ player: `${p.gameName}#${p.riotTag}`, teamId });
        }

        if (blueTeamIds.size !== 1) {
          const breakdown = bluePlayerTeams
            .map((pt) => `${pt.player} (team: ${pt.teamId})`)
            .join(', ');
          throw new Error(
            `Unanimous team membership validation failed: blue side players belong to ${blueTeamIds.size} different teams in game ${game.fileName}. Roster breakdown: [${breakdown}]`
          );
        }
        if (redTeamIds.size !== 1) {
          const breakdown = redPlayerTeams
            .map((pt) => `${pt.player} (team: ${pt.teamId})`)
            .join(', ');
          throw new Error(
            `Unanimous team membership validation failed: red side players belong to ${redTeamIds.size} different teams in game ${game.fileName}. Roster breakdown: [${breakdown}]`
          );
        }

        const [blueTeamId] = blueTeamIds;
        const [redTeamId] = redTeamIds;

        if (!blueTeamId || !redTeamId) {
          throw new Error(`Unable to resolve team identifiers for game ${game.fileName}`);
        }

        if (blueTeamId === redTeamId) {
          throw new Error(
            `Unanimous team membership validation failed: blue team and red team are identical (${blueTeamId}) in game ${game.fileName}`
          );
        }

        // Resolve match between teams
        const gameDate = game.gameCreation ? new Date(game.gameCreation) : undefined;
        const matchResult = await this.findMatchForTeams(blueTeamId, redTeamId, gameDate, tx);

        if (!matchResult) {
          throw new Error(
            `No match found between teams ${blueTeamId} and ${redTeamId} for game ${game.fileName}`
          );
        }
        if (matchResult.isClosed) {
          throw new Error(`Match ${matchResult.matchId} is already completed/closed`);
        }

        const matchId = matchResult.matchId;

        // Lock match row early before computing game numbers or inserting games
        if (!matchStateMap.has(matchId)) {
          const [matchRow] = await tx
            .select()
            .from(matches)
            .where(eq(matches.id, matchId))
            .for('update');
          if (!matchRow) {
            throw new Error(`Match ${matchId} not found in database`);
          }
          if (matchRow.status === 'completed') {
            throw new Error(`Match ${matchId} is already completed/closed`);
          }
          matchStateMap.set(matchId, {
            team1Id: matchRow.team1Id,
            team2Id: matchRow.team2Id,
            bestOf: matchRow.bestOf,
            team1Score: matchRow.team1Score,
            team2Score: matchRow.team2Score
          });
        }

        // Manage game number sequence within match
        if (!gameNumberMap.has(matchId)) {
          const existingMatchGames = await tx
            .select({ gameNumber: matchGames.gameNumber })
            .from(matchGames)
            .where(eq(matchGames.matchesId, matchId));
          const maxNum = existingMatchGames.reduce((max, g) => Math.max(max, g.gameNumber), 0);
          gameNumberMap.set(matchId, maxNum);
        }
        const currentMax = gameNumberMap.get(matchId) ?? 0;
        const nextGameNumber = currentMax + 1;
        gameNumberMap.set(matchId, nextGameNumber);

        const matchGameId = crypto.randomUUID();
        const winnerTeamId = game.winnerSide === 'blue' ? blueTeamId : redTeamId;

        await tx.insert(matchGames).values({
          id: matchGameId,
          matchesId: matchId,
          gameNumber: nextGameNumber,
          blueTeamId,
          redTeamId,
          winnerTeamId,
          durationSeconds: game.durationSeconds,
          externalGameId: game.externalGameId
        });

        // Collect all participant records for multi-row bulk insert
        const infoRows: NewPlayerGameInfo[] = [];
        const statsRows: NewPlayerGameStats[] = [];
        const runesRows: NewPlayerGameRunes[] = [];
        const buildRows: NewPlayerGameBuild[] = [];

        for (const p of game.participants) {
          const key = `${p.gameName.toLowerCase()}#${p.riotTag.toLowerCase()}`;
          const lookup = playerLookupMap.get(key);
          if (!lookup) {
            throw new Error(`Player not found: ${p.gameName}#${p.riotTag}`);
          }
          const infoId = crypto.randomUUID();
          const teamId = p.side === 'blue' ? blueTeamId : redTeamId;

          infoRows.push({
            id: infoId,
            matchGameId,
            playerId: lookup.playerId,
            teamId,
            side: p.side,
            champion: p.champion,
            position: p.position
          });

          statsRows.push({
            id: infoId,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            cs: p.cs,
            damageToChampions: p.damageToChampions,
            visionScore: p.visionScore,
            ...(p.extraStats as Partial<NewPlayerGameStats>)
          });

          runesRows.push({
            id: infoId,
            primaryKeystoneId: p.runes.primaryKeystoneId,
            primaryPerk: p.runes.primaryPerk,
            primaryPerk1: p.runes.primaryPerk1,
            primaryPerk2: p.runes.primaryPerk2,
            primaryPerk3: p.runes.primaryPerk3,
            secundaryRuneId: p.runes.secundaryRuneId,
            secundaryPerk1: p.runes.secundaryPerk1,
            secundaryPerk2: p.runes.secundaryPerk2,
            statPerkOffense: p.runes.statPerkOffense,
            statPerkFlex: p.runes.statPerkFlex,
            statPerkDefense: p.runes.statPerkDefense
          });

          buildRows.push({
            id: infoId,
            item0: p.build.item0,
            item1: p.build.item1,
            item2: p.build.item2,
            item3: p.build.item3,
            item4: p.build.item4,
            item5: p.build.item5,
            trinket: p.build.trinket,
            summonerSpell1Id: p.build.summonerSpell1Id,
            summonerSpell2Id: p.build.summonerSpell2Id
          });
        }

        // Multi-row bulk insertions inside transaction (Directive 4)
        if (infoRows.length > 0) {
          await tx.insert(playerGameInfo).values(infoRows);
          await tx.insert(playerGameStats).values(statsRows);
          await tx.insert(playerGameRunes).values(runesRows);
          await tx.insert(playerGameBuild).values(buildRows);
        }

        // Update match scores and completion status
        const state = matchStateMap.get(matchId);
        if (!state) {
          throw new Error(`Match state not found for match ${matchId}`);
        }

        if (winnerTeamId === state.team1Id) {
          state.team1Score += 1;
        } else if (winnerTeamId === state.team2Id) {
          state.team2Score += 1;
        }

        const winThreshold = Math.floor(state.bestOf / 2) + 1;
        const isCompleted = state.team1Score >= winThreshold || state.team2Score >= winThreshold;
        const seriesWinner = isCompleted
          ? state.team1Score >= winThreshold
            ? state.team1Id
            : state.team2Id
          : null;

        await tx
          .update(matches)
          .set({
            team1Score: state.team1Score,
            team2Score: state.team2Score,
            status: isCompleted ? 'completed' : 'live',
            winnerTeamId: seriesWinner,
            finishedAt: isCompleted ? new Date() : null,
            updatedAt: new Date()
          })
          .where(eq(matches.id, matchId));

        insertedGames += 1;
      }
    });

    return {
      insertedGames,
      skippedDuplicates
    };
  }
}
