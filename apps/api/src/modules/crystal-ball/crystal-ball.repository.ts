import type { CrystalAnswers, CrystalBallData } from '@rcl/contracts';
import {
  crystalBallLeagueCampaigns as campaigns,
  discordUsers,
  divisions as divisionDefinitions,
  crystalBallLeagueEntries as entries,
  matchGames,
  matches,
  playerGameInfo,
  playerGameStats,
  players,
  rounds,
  seasons,
  seasonsDivisions,
  teamMemberships,
  teams
} from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { and, eq, gte, inArray } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { AppError, notFound } from '../../shared/app-error.js';
import { crystalPoints, normalizeNumericAnswers, validateAnswers } from './crystal-ball-policy.js';
import { crystalQuestions } from './crystal-ball-questions.js';
import { automaticResults } from './crystal-ball-results.js';

export class CrystalBallRepository {
  constructor(
    private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>,
    private readonly divisionId = ''
  ) {}

  forDivision(divisionId: string) {
    return new CrystalBallRepository(this.db, divisionId);
  }

  private async context(season: string) {
    const [exists] = await this.db.select().from(seasons).where(eq(seasons.name, season));
    if (!exists) throw notFound('Season');
    const divisions = await this.db
      .select({ id: seasonsDivisions.id, name: seasonsDivisions.divisionName })
      .from(seasonsDivisions)
      .innerJoin(divisionDefinitions, eq(divisionDefinitions.name, seasonsDivisions.divisionName))
      .where(and(eq(seasonsDivisions.seasonName, season), eq(seasonsDivisions.id, this.divisionId)))
      .orderBy(divisionDefinitions.sortOrder, seasonsDivisions.divisionName);
    if (!divisions.length) throw notFound('Division');
    const candidates = await this.db
      .select({
        id: teams.id,
        name: teams.name,
        shortName: teams.shortName,
        imageUrl: teams.logoUrl,
        divisionId: teams.seasonDivisionId
      })
      .from(teams)
      .where(
        and(
          eq(teams.seasonName, season),
          eq(teams.seasonDivisionId, this.divisionId),
          gte(teams.discordRoleId, 0n)
        )
      );
    const members = await this.db
      .selectDistinct({
        id: players.id,
        name: players.gameName,
        discordId: players.discordUserId,
        avatarHash: discordUsers.avatarHash
      })
      .from(players)
      .leftJoin(discordUsers, eq(discordUsers.discordId, players.discordUserId))
      .innerJoin(teamMemberships, eq(players.discordUserId, teamMemberships.discordUserId))
      .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
      .where(
        and(
          eq(teamMemberships.seasonName, season),
          eq(players.isMain, true),
          gte(teams.discordRoleId, 0n),
          eq(teams.seasonDivisionId, this.divisionId),
          inArray(teamMemberships.role, ['top', 'jungle', 'mid', 'adc', 'support', 'substitute'])
        )
      );
    return crystalQuestions(
      divisions,
      candidates.sort((a, b) => a.name.localeCompare(b.name)),
      members.sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  private async playoffs(season: string) {
    return this.db
      .select({
        id: matches.id,
        status: matches.status,
        scheduledAt: matches.scheduledAt,
        roundStart: rounds.startsAt,
        bestOf: matches.bestOf,
        homeScore: matches.team1Score,
        awayScore: matches.team2Score
      })
      .from(matches)
      .innerJoin(
        rounds,
        and(eq(rounds.id, matches.idRound), eq(rounds.idSeasonDivision, matches.idSeasonDivision))
      )
      .innerJoin(seasonsDivisions, eq(seasonsDivisions.id, matches.idSeasonDivision))
      .where(
        and(
          eq(seasonsDivisions.seasonName, season),
          eq(rounds.stage, 'playoff'),
          eq(matches.idSeasonDivision, this.divisionId)
        )
      );
  }

  private async window(season: string, campaign: typeof campaigns.$inferSelect | undefined) {
    const playoffMatches = (await this.playoffs(season)).filter((m) => m.status !== 'cancelled');
    const starts = playoffMatches.flatMap((m) =>
      [m.scheduledAt, m.roundStart].filter((d): d is Date => d !== null)
    );
    const deadline = campaign ? Math.min(campaign.closesAt.getTime(), ...starts.map(Number)) : null;
    const started = playoffMatches.some((m) => m.status !== 'scheduled');
    const now = Date.now();
    const status: CrystalBallData['status'] = !campaign
      ? 'unconfigured'
      : campaign.finalizedAt
        ? 'resolved'
        : started || now >= (deadline ?? 0)
          ? 'closed'
          : now < campaign.opensAt.getTime()
            ? 'upcoming'
            : 'open';
    return { status, closesAt: deadline === null ? null : new Date(deadline).toISOString() };
  }

  async overview(season: string): Promise<CrystalBallData> {
    const questions = await this.context(season);
    const [campaign] = await this.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.divisionId, this.divisionId));
    const window = await this.window(season, campaign);
    const results = normalizeNumericAnswers(campaign?.results ?? {});
    const ballots = Object.keys(results).length
      ? await this.db
          .select({
            userId: entries.discordUserId,
            username: discordUsers.username,
            globalName: discordUsers.globalName,
            avatarHash: discordUsers.avatarHash,
            answers: entries.answers
          })
          .from(entries)
          .innerJoin(discordUsers, eq(discordUsers.discordId, entries.discordUserId))
          .where(eq(entries.divisionId, this.divisionId))
      : [];
    return {
      season,
      divisionId: this.divisionId,
      ...window,
      opensAt: campaign?.opensAt.toISOString() ?? null,
      questions,
      results,
      ranking: ballots
        .map((b) => ({
          userId: b.userId,
          name: b.globalName ?? b.username,
          avatarHash: b.avatarHash,
          points: crystalPoints(b.answers, results)
        }))
        .sort(
          (a, b) =>
            b.points - a.points || a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId)
        )
    };
  }

  async mine(season: string, userId: string): Promise<CrystalAnswers> {
    await this.context(season);
    const [entry] = await this.db
      .select()
      .from(entries)
      .where(and(eq(entries.divisionId, this.divisionId), eq(entries.discordUserId, userId)));
    return normalizeNumericAnswers(entry?.answers ?? {});
  }

  async save(season: string, userId: string, answers: CrystalAnswers) {
    await this.db.transaction(async (tx) => {
      const repository = new CrystalBallRepository(tx, this.divisionId);
      await repository.context(season);
      const [campaign] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.divisionId, this.divisionId))
        .for('update');
      if ((await repository.window(season, campaign)).status !== 'open')
        throw new AppError(409, 'CRYSTAL_CLOSED', 'Voting is closed.');
      const questions = await repository.context(season);
      validateAnswers(answers, questions);
      if (questions.some((q) => !answers[q.id]))
        throw new AppError(400, 'INCOMPLETE_BALLOT', 'Answer every question before saving.');
      const normalized = Object.fromEntries(
        Object.entries(answers).map(([id, values]) => [
          id,
          questions.find((q) => q.id === id)?.kind === 'champion'
            ? values.map((v) => v.toLowerCase())
            : values
        ])
      );
      await tx
        .insert(entries)
        .values({ divisionId: this.divisionId, discordUserId: userId, answers: normalized })
        .onConflictDoUpdate({
          target: [entries.divisionId, entries.discordUserId],
          set: { answers: normalized, updatedAt: new Date() }
        });
    });
  }

  async configure(season: string, opensAt: Date, closesAt: Date) {
    await this.db.transaction(async (tx) => {
      const repo = new CrystalBallRepository(tx, this.divisionId);
      await repo.context(season);
      // A season row serializes the first configuration too.
      await tx.select().from(seasons).where(eq(seasons.name, season)).for('update');
      const [existing] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.divisionId, this.divisionId))
        .for('update');
      if (existing && ['closed', 'resolved'].includes((await repo.window(season, existing)).status))
        throw new AppError(409, 'CRYSTAL_CLOSED', 'A closed campaign cannot be reopened.');
      if (opensAt >= closesAt || closesAt.getTime() <= Date.now())
        throw new AppError(
          400,
          'INVALID_WINDOW',
          'Closing time must follow opening time and be in the future.'
        );
      const upcoming = {
        divisionId: this.divisionId,
        opensAt,
        closesAt,
        finalizedAt: null,
        results: {},
        resolvedBy: null,
        updatedAt: new Date()
      };
      const window = await repo.window(season, upcoming);
      if (window.status === 'closed' || window.closesAt !== closesAt.toISOString())
        throw new AppError(400, 'INVALID_WINDOW', 'Close voting no later than the first playoff.');
      await tx
        .insert(campaigns)
        .values(upcoming)
        .onConflictDoUpdate({
          target: campaigns.divisionId,
          set: { opensAt, closesAt, updatedAt: new Date() }
        });
    });
  }

  async resolve(season: string, actor: string, manual: CrystalAnswers, finalize: boolean) {
    await this.context(season);
    await this.db.transaction(async (tx) => {
      const repo = new CrystalBallRepository(tx, this.divisionId);
      const [campaign] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.divisionId, this.divisionId))
        .for('update');
      if (
        !campaign ||
        !['closed', 'resolved'].includes((await repo.window(season, campaign)).status)
      )
        throw new AppError(409, 'CRYSTAL_NOT_CLOSED', 'Close voting before resolving results.');
      const questions = await repo.context(season);
      const manualQuestions = questions.filter((q) => q.mode === 'manual');
      validateAnswers(manual, manualQuestions, true);
      const playoffMatches = (await repo.playoffs(season)).filter((m) => m.status !== 'cancelled');
      let automatic: CrystalAnswers = {};
      if (finalize) {
        if (
          !playoffMatches.length ||
          playoffMatches.some((m) => !['completed', 'forfeit'].includes(m.status))
        )
          throw new AppError(409, 'PLAYOFFS_UNFINISHED', 'All playoff series must be finished.');
        const completed = playoffMatches.filter((m) => m.status === 'completed');
        const games = completed.length
          ? await tx
              .select()
              .from(matchGames)
              .where(
                inArray(
                  matchGames.matchesId,
                  completed.map((m) => m.id)
                )
              )
          : [];
        if (
          completed.some(
            (m) =>
              m.homeScore + m.awayScore === 0 ||
              games.filter((g) => g.matchesId === m.id).length !== m.homeScore + m.awayScore
          )
        )
          throw new AppError(
            409,
            'MISSING_MAPS',
            'Import every completed playoff map before finalizing.'
          );
        const stats = games.length
          ? await tx
              .select({
                gameId: playerGameInfo.matchGameId,
                playerId: playerGameInfo.playerId,
                teamId: playerGameInfo.teamId,
                champion: playerGameInfo.champion,
                position: playerGameInfo.position,
                kills: playerGameStats.kills,
                assists: playerGameStats.assists,
                deaths: playerGameStats.deaths,
                isMvp: playerGameStats.isMvp,
                pentaKills: playerGameStats.pentaKills,
                goldEarned: playerGameStats.goldEarned
              })
              .from(playerGameInfo)
              .innerJoin(playerGameStats, eq(playerGameStats.id, playerGameInfo.id))
              .where(
                inArray(
                  playerGameInfo.matchGameId,
                  games.map((g) => g.id)
                )
              )
          : [];
        automatic = automaticResults(games, stats);
      }
      // Recalculation replaces previous automatic results; it never adds points twice.
      const results = {
        ...(finalize
          ? automatic
          : Object.fromEntries(
              Object.entries(campaign.results).filter(([id]) =>
                questions.some((q) => q.id === id && q.mode === 'automatic')
              )
            )),
        ...manual
      };
      await tx
        .update(campaigns)
        .set({
          results,
          resolvedBy: actor,
          finalizedAt: finalize ? new Date() : campaign.finalizedAt,
          updatedAt: new Date()
        })
        .where(eq(campaigns.divisionId, this.divisionId));
    });
  }
}
