import { divisions, matches, rounds, seasons, seasonsDivisions, teams } from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { CompetitionRepository } from './competition.repository.js';

// Keep the public DTOs stable: season id is now its name; division id is
// the seasons_divisions UUID. Round identifiers are scoped to that UUID.
export class PostgresCompetitionRepository implements CompetitionRepository {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>) {}
  private seasonSelection = {
    id: seasons.name,
    name: seasons.name,
    startsOn: seasons.startsOn,
    endsOn: seasons.endsOn,
    isActive: seasons.isActive
  };
  seasons() {
    return this.db
      .select(this.seasonSelection)
      .from(seasons)
      .orderBy(desc(seasons.isActive), desc(seasons.startsOn), asc(seasons.name));
  }
  async season(name: string) {
    return (
      await this.db
        .select(this.seasonSelection)
        .from(seasons)
        .where(eq(seasons.name, name))
        .limit(1)
    )[0];
  }
  private divisionSelection = {
    id: seasonsDivisions.id,
    seasonId: seasonsDivisions.seasonName,
    code: divisions.name,
    name: divisions.name,
    sortOrder: divisions.sortOrder
  };
  divisions(seasonName: string) {
    return this.db
      .select(this.divisionSelection)
      .from(seasonsDivisions)
      .innerJoin(divisions, eq(divisions.name, seasonsDivisions.divisionName))
      .where(eq(seasonsDivisions.seasonName, seasonName))
      .orderBy(asc(divisions.sortOrder), asc(divisions.name));
  }
  async division(id: string) {
    return (
      await this.db
        .select(this.divisionSelection)
        .from(seasonsDivisions)
        .innerJoin(divisions, eq(divisions.name, seasonsDivisions.divisionName))
        .where(eq(seasonsDivisions.id, id))
        .limit(1)
    )[0];
  }
  teams(divisionId: string) {
    return this.db
      .select({
        id: teams.id,
        divisionId: teams.seasonDivisionId,
        name: teams.name,
        shortName: teams.shortName,
        logoUrl: teams.logoUrl,
        color: teams.color,
        isActive: teams.isActive
      })
      .from(teams)
      .where(eq(teams.seasonDivisionId, divisionId))
      .orderBy(asc(teams.name), asc(teams.id));
  }
  rounds(divisionId: string) {
    return this.db
      .select({
        id: sql<string>`${rounds.id}::text`,
        sequence: rounds.id,
        divisionId: rounds.idSeasonDivision,
        stage: rounds.stage,
        name: rounds.name,
        startsAt: rounds.startsAt,
        lockAt: sql<null>`NULL`
      })
      .from(rounds)
      .where(eq(rounds.idSeasonDivision, divisionId))
      .orderBy(asc(rounds.id));
  }
  matches(divisionId: string) {
    return this.db
      .select({
        id: matches.id,
        divisionId: matches.idSeasonDivision,
        roundId: sql<string | null>`${matches.idRound}::text`,
        homeTeamId: matches.team1Id,
        awayTeamId: matches.team2Id,
        homeScore: matches.team1Score,
        awayScore: matches.team2Score,
        winnerTeamId: matches.winnerTeamId,
        status: matches.status,
        bestOf: matches.bestOf,
        scheduledAt: matches.scheduledAt,
        finishedAt: matches.finishedAt,
        streamUrl: matches.streamUrl
      })
      .from(matches)
      .where(eq(matches.idSeasonDivision, divisionId))
      .orderBy(asc(matches.scheduledAt), asc(matches.id));
  }
}
