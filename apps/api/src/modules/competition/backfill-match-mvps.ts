import { matchGames, matches, playerGameInfo } from '@rcl/database';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { type MvpDatabase, loadMatchMvpRows } from './match-mvp-data.js';
import { matchMvps } from './player-statistics.js';

export interface MvpBackfillEntry {
  matchId: string;
  status: 'planned' | 'updated' | 'preserved' | 'unresolved' | 'skipped';
  playerId?: string;
  score?: string;
  reason?: string;
}

// One transaction per series: safe to resume, and serialized against uploads and other backfills.
export async function backfillMatchMvps(db: MvpDatabase, apply = false) {
  const entries: MvpBackfillEntry[] = [];
  const completed = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.status, 'completed'))
    .orderBy(asc(matches.id));
  for (const { id } of completed) {
    entries.push(
      await db.transaction(async (tx): Promise<MvpBackfillEntry> => {
        const query = tx.select().from(matches).where(eq(matches.id, id));
        const [match] = await (apply ? query.for('update') : query);
        const issue = (reason: string): MvpBackfillEntry => ({
          matchId: id,
          status: 'unresolved',
          reason
        });
        if (!match || match.status !== 'completed') return { matchId: id, status: 'skipped' };
        if (match.mvpPlayerId !== null || match.mvpScore !== null) {
          if (match.mvpPlayerId === null || match.mvpScore === null)
            return issue('partial_existing_award');
          return {
            matchId: id,
            status: 'preserved',
            playerId: match.mvpPlayerId,
            score: match.mvpScore
          };
        }
        const maps = await tx.select().from(matchGames).where(eq(matchGames.matchesId, id));
        if (!maps.length) return issue('no_maps');
        if (
          maps.some((map) => !map.winnerTeamId || !map.durationSeconds || map.durationSeconds <= 0)
        ) {
          return issue('unfinished_map_or_missing_duration');
        }
        const team1Wins = maps.filter((map) => map.winnerTeamId === match.team1Id).length;
        const team2Wins = maps.filter((map) => map.winnerTeamId === match.team2Id).length;
        if (
          maps.length > match.bestOf ||
          team1Wins !== match.team1Score ||
          team2Wins !== match.team2Score ||
          team1Wins + team2Wins !== maps.length ||
          Math.max(team1Wins, team2Wins) !== Math.floor(match.bestOf / 2) + 1 ||
          match.winnerTeamId !== (team1Wins > team2Wins ? match.team1Id : match.team2Id)
        ) {
          return issue('inconsistent_series_result');
        }
        const rows = await loadMatchMvpRows(tx, id);
        const participants = await tx
          .select({ id: playerGameInfo.id })
          .from(playerGameInfo)
          .innerJoin(matchGames, eq(matchGames.id, playerGameInfo.matchGameId))
          .where(eq(matchGames.matchesId, id));
        if (
          rows.length !== participants.length ||
          maps.some(
            (map) =>
              !rows.some((row) => row.gameId === map.id && row.teamId === match.team1Id) ||
              !rows.some((row) => row.gameId === map.id && row.teamId === match.team2Id)
          )
        ) {
          return issue('missing_participant_statistics');
        }
        const award = matchMvps(rows)[0];
        if (
          !award ||
          !rows.some((row) => row.playerId === award.playerId && row.teamId === match.winnerTeamId)
        ) {
          return issue('no_eligible_mvp');
        }
        const score = award.score.toFixed(1);
        if (apply) {
          const [saved] = await tx
            .update(matches)
            .set({ mvpPlayerId: award.playerId, mvpScore: score })
            .where(
              and(
                eq(matches.id, id),
                eq(matches.status, 'completed'),
                isNull(matches.mvpPlayerId),
                isNull(matches.mvpScore)
              )
            )
            .returning({ playerId: matches.mvpPlayerId, score: matches.mvpScore });
          if (saved?.playerId !== award.playerId || saved.score !== score) {
            throw new Error(`MVP verification failed for match ${id}`);
          }
          const [verified] = await tx.select().from(matches).where(eq(matches.id, id));
          if (verified?.mvpPlayerId !== award.playerId || verified.mvpScore !== score) {
            throw new Error(`MVP read-back verification failed for match ${id}`);
          }
        }
        return {
          matchId: id,
          status: apply ? 'updated' : 'planned',
          playerId: award.playerId,
          score
        };
      })
    );
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    total: entries.length,
    planned: entries.filter((entry) => entry.status === 'planned').length,
    updated: entries.filter((entry) => entry.status === 'updated').length,
    preserved: entries.filter((entry) => entry.status === 'preserved').length,
    unresolved: entries.filter((entry) => entry.status === 'unresolved').length,
    skipped: entries.filter((entry) => entry.status === 'skipped').length,
    entries
  };
}
