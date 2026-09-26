import type { PredictionPick, PredictionsData, PredictorStanding } from '@rcl/contracts';
import { discordUsers, matches, predictions, seasonsDivisions } from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { and, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { AppError, notFound } from '../../shared/app-error.js';
import { leagueWeek, predictionPoints, predictionWindow } from './prediction-policy.js';

export class PredictionsRepository {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>) {}

  async overview(divisionId: string, now = new Date()): Promise<PredictionsData> {
    const [division] = await this.db
      .select()
      .from(seasonsDivisions)
      .where(eq(seasonsDivisions.id, divisionId));
    if (!division) throw notFound('Division');
    const calendar = await this.db
      .select()
      .from(matches)
      .where(eq(matches.idSeasonDivision, divisionId));
    const votes = await this.db
      .select({ pick: predictions, match: matches, user: discordUsers })
      .from(predictions)
      .innerJoin(matches, eq(matches.id, predictions.matchId))
      .innerJoin(seasonsDivisions, eq(seasonsDivisions.id, matches.idSeasonDivision))
      .innerJoin(discordUsers, eq(discordUsers.discordId, predictions.discordUserId))
      .where(eq(seasonsDivisions.seasonName, division.seasonName));
    const ranking = new Map<string, PredictorStanding>();
    for (const { pick, match, user } of votes) {
      if (!['completed', 'forfeit'].includes(match.status) || !match.winnerTeamId) continue;
      const row = ranking.get(user.discordId) ?? {
        userId: user.discordId,
        name: user.globalName ?? user.username,
        position: 0,
        correct: 0,
        total: 0,
        points: 0
      };
      const correct = pick.selectedTeamId === match.winnerTeamId;
      row.total++;
      row.correct += Number(correct);
      row.points += predictionPoints(
        correct,
        pick.homeScore === match.team1Score && pick.awayScore === match.team2Score
      );
      ranking.set(user.discordId, row);
    }
    return {
      ...leagueWeek(now),
      matches: calendar
        .filter(
          (match) =>
            match.scheduledAt &&
            leagueWeek(match.scheduledAt).week === leagueWeek(now).week &&
            match.status !== 'cancelled'
        )
        .map((match) => {
          const window = predictionWindow(match.scheduledAt, match.status, now);
          const picks = votes.filter(({ pick }) => pick.matchId === match.id);
          return {
            matchId: match.id,
            ...window,
            votes: window.closed ? picks.length : null,
            homePercent:
              window.closed && picks.length
                ? Math.round(
                    (100 *
                      picks.filter(({ pick }) => pick.selectedTeamId === match.team1Id).length) /
                      picks.length
                  )
                : null
          };
        }),
      ranking: [...ranking.values()]
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
