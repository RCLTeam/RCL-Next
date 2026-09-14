import { divisions, matches, rounds, seasons, teams } from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { asc, desc, eq } from 'drizzle-orm';
import type { CompetitionRepository } from './competition.repository.js';

export class PostgresCompetitionRepository implements CompetitionRepository {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>) {}
  seasons() { return this.db.select().from(seasons).orderBy(desc(seasons.isActive), desc(seasons.startsOn), asc(seasons.id)); }
  async season(id: string) { return (await this.db.select().from(seasons).where(eq(seasons.id, id)).limit(1))[0]; }
  divisions(seasonId: string) { return this.db.select().from(divisions).where(eq(divisions.seasonId, seasonId)).orderBy(asc(divisions.sortOrder), asc(divisions.id)); }
  async division(id: string) { return (await this.db.select().from(divisions).where(eq(divisions.id, id)).limit(1))[0]; }
  teams(divisionId: string) { return this.db.select().from(teams).where(eq(teams.divisionId, divisionId)).orderBy(asc(teams.name), asc(teams.id)); }
  rounds(divisionId: string) { return this.db.select().from(rounds).where(eq(rounds.divisionId, divisionId)).orderBy(asc(rounds.sequence), asc(rounds.id)); }
  matches(divisionId: string) { return this.db.select().from(matches).where(eq(matches.divisionId, divisionId)).orderBy(asc(matches.scheduledAt), asc(matches.id)); }
}
