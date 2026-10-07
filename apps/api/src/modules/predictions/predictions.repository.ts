import type { PredictionPick, PredictionsData, PredictorStanding } from '@rcl/contracts';
import { discordUsers, matches, predictions, rounds, seasonsDivisions, teams } from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { AppError, notFound } from '../../shared/app-error.js';
import {
  currentRoundId,
  leagueWeek,
  predictionPoints,
  predictionWindow
} from './prediction-policy.js';

export interface OverviewOptions {
  roundId?: number;
  now?: Date;
}

export class PredictionsRepository {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>) {}

  async overview(
    divisionId: string,
    { roundId, now = new Date() }: OverviewOptions = {}
  ): Promise<PredictionsData> {
    const [division] = await this.db
      .select()
      .from(seasonsDivisions)
      .where(eq(seasonsDivisions.id, divisionId));
    if (!division) throw notFound('Division');
    const divisionRounds = await this.db
      .select({ id: rounds.id, startsAt: rounds.startsAt })
      .from(rounds)
      .where(eq(rounds.idSeasonDivision, divisionId));
    if (roundId !== undefined && !divisionRounds.some((round) => round.id === roundId))
      throw notFound('Round');
    const currentRound = currentRoundId(divisionRounds, now);
    const shownRound = roundId ?? currentRound;
    const homeTeam = alias(teams, 'prediction_home_team');
    const awayTeam = alias(teams, 'prediction_away_team');
    const calendar = await this.db
      .select({ match: matches })
      .from(matches)
      .innerJoin(homeTeam, eq(homeTeam.id, matches.team1Id))
      .innerJoin(awayTeam, eq(awayTeam.id, matches.team2Id))
      .where(
        and(
          eq(matches.idSeasonDivision, divisionId),
          gte(homeTeam.discordRoleId, 0n),
          gte(awayTeam.discordRoleId, 0n)
        )
      );
    const finished = ['completed', 'forfeit'] as const;
    const correct = sql`${predictions.selectedTeamId} = ${matches.winnerTeamId}`;
    // A pick without a score never matches: NULL comparisons are excluded by the FILTER clauses.
    const exact = sql`${predictions.homeScore} = ${matches.team1Score} AND ${predictions.awayScore} = ${matches.team2Score}`;
    const tally = (condition: ReturnType<typeof sql>) =>
      sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
    // One row per user: the season ranking never loads individual votes.
    const standings = await this.db
      .select({
        userId: discordUsers.discordId,
        username: discordUsers.username,
        globalName: discordUsers.globalName,
        avatarHash: discordUsers.avatarHash,
        total: sql<number>`count(*)`.mapWith(Number),
        correct: tally(correct),
        correctExact: tally(sql`${correct} AND ${exact}`),
        wrongExact: tally(sql`NOT (${correct}) AND ${exact}`)
      })
      .from(predictions)
      .innerJoin(matches, eq(matches.id, predictions.matchId))
      .innerJoin(seasonsDivisions, eq(seasonsDivisions.id, matches.idSeasonDivision))
      .innerJoin(discordUsers, eq(discordUsers.discordId, predictions.discordUserId))
      .where(
        and(
          eq(seasonsDivisions.seasonName, division.seasonName),
          inArray(matches.status, [...finished]),
          isNotNull(matches.winnerTeamId)
        )
      )
      .groupBy(discordUsers.discordId);
    const ranking = standings.map(
      (row): PredictorStanding => ({
        userId: row.userId,
        name: row.globalName ?? row.username,
        avatarHash: row.avatarHash,
        position: 0,
        correct: row.correct,
        total: row.total,
        points:
          row.correctExact * predictionPoints(true, true) +
          (row.correct - row.correctExact) * predictionPoints(true, false) +
          row.wrongExact * predictionPoints(false, true) +
          (row.total - row.correct - row.wrongExact) * predictionPoints(false, false)
      })
    );
    const shown = calendar
      .map(({ match }) => match)
      .filter(
        (match) =>
          shownRound !== null &&
          match.idRound === shownRound &&
          match.scheduledAt !== null &&
          match.status !== 'cancelled'
      );
    const isFinished = (status: string) => (finished as readonly string[]).includes(status);
    // Vote counts are only read for the shown matches whose results are public.
    const revealed = shown.filter((match) => isFinished(match.status)).map((match) => match.id);
    const counts = new Map(
      (revealed.length
        ? await this.db
            .select({
              matchId: predictions.matchId,
              votes: sql<number>`count(*)`.mapWith(Number),
              home: tally(sql`${predictions.selectedTeamId} = ${matches.team1Id}`)
            })
            .from(predictions)
            .innerJoin(matches, eq(matches.id, predictions.matchId))
            .where(inArray(predictions.matchId, revealed))
            .groupBy(predictions.matchId)
        : []
      ).map((row) => [row.matchId, row])
    );
    return {
      ...leagueWeek(now),
      round: shownRound === null ? null : String(shownRound),
      currentRound: currentRound === null ? null : String(currentRound),
      open: calendar.some(
        ({ match }) => predictionWindow(match.scheduledAt, match.status, now).open
      ),
      matches: shown.map((match) => {
        const window = predictionWindow(match.scheduledAt, match.status, now);
        const revealVotes = isFinished(match.status);
        const { votes = 0, home = 0 } = counts.get(match.id) ?? {};
        return {
          matchId: match.id,
          ...window,
          votes: revealVotes ? votes : null,
          homePercent: revealVotes && votes ? Math.round((100 * home) / votes) : null
        };
      }),
      ranking: ranking
        .sort(
          (a, b) =>
            b.points - a.points ||
            b.correct - a.correct ||
            a.name.localeCompare(b.name) ||
            a.userId.localeCompare(b.userId)
        )
        .map((row, index) => ({ ...row, position: index + 1 }))
    };
  }

  async mine(divisionId: string, userId: string): Promise<PredictionPick[]> {
    return this.db
      .select({
        matchId: predictions.matchId,
        selectedTeamId: predictions.selectedTeamId,
        homeScore: predictions.homeScore,
        awayScore: predictions.awayScore
      })
      .from(predictions)
      .innerJoin(matches, eq(matches.id, predictions.matchId))
      .where(and(eq(matches.idSeasonDivision, divisionId), eq(predictions.discordUserId, userId)));
  }

  async save(userId: string, pick: PredictionPick): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [match] = await tx
        .select()
        .from(matches)
        .where(eq(matches.id, pick.matchId))
        .for('update');
      if (!match) throw notFound('Match');
      const participants = await tx
        .select({ id: teams.id, discordRoleId: teams.discordRoleId })
        .from(teams)
        .where(inArray(teams.id, [match.team1Id, match.team2Id]))
        .for('share');
      if (
        !match.team1Id ||
        !match.team2Id ||
        ![match.team1Id, match.team2Id].every((id) =>
          participants.some(
            (team) => team.id === id && team.discordRoleId !== null && team.discordRoleId >= 0n
          )
        )
      )
        throw new AppError(
          409,
          'INACTIVE_TEAMS',
          'Predictions are not allowed for matches with inactive or ghost teams.'
        );
      if (!predictionWindow(match.scheduledAt, match.status, new Date()).open)
        throw new AppError(409, 'PREDICTIONS_CLOSED', 'Voting is closed.');
      const home = pick.selectedTeamId === match.team1Id;
      if (!home && pick.selectedTeamId !== match.team2Id)
        throw new AppError(400, 'INVALID_TEAM', 'Choose a match participant.');
      const wins = Math.floor(match.bestOf / 2) + 1;
      const winnerScore = home ? pick.homeScore : pick.awayScore;
      const loserScore = home ? pick.awayScore : pick.homeScore;
      if (
        (pick.homeScore !== null || pick.awayScore !== null) &&
        (winnerScore !== wins || loserScore === null || loserScore < 0 || loserScore >= wins)
      )
        throw new AppError(400, 'INVALID_SCORE', 'Invalid series score.');
      await tx
        .insert(predictions)
        .values({ ...pick, discordUserId: userId })
        .onConflictDoUpdate({
          target: [predictions.discordUserId, predictions.matchId],
          set: {
            selectedTeamId: pick.selectedTeamId,
            homeScore: pick.homeScore,
            awayScore: pick.awayScore,
            updatedAt: new Date()
          }
        });
    });
  }
}
