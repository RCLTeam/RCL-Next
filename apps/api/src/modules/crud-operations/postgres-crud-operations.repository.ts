import type { CrudRecord, CrudValue } from '@rcl/contracts';
import { auditLogs, matchGames, matches, predictions, rosterMovements, teams } from '@rcl/database';
import * as schema from '@rcl/database/schema';
import { and, asc, eq, getTableColumns, is, or, sql } from 'drizzle-orm';
import {
  type PgDatabase,
  type PgQueryResultHKT,
  PgTable,
  getTableConfig
} from 'drizzle-orm/pg-core';
import { AppError, notFound } from '../../shared/app-error.js';
import type { CrudMutation, CrudOperationsRepository } from './crud-operations.repository.js';
import { type ResourceDefinition, crudResources } from './crud-operations.resources.js';

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
type StoredResource = ResourceDefinition & { table: PgTable };
const resourceTables: Record<string, PgTable> = {
  seasons: schema.seasons,
  divisions: schema.divisions,
  competitions: schema.seasonsDivisions,
  teams: schema.teams,
  users: schema.discordUsers,
  players: schema.players,
  memberships: schema.teamMemberships,
  rounds: schema.rounds,
  matches: schema.matches
};
function storedResource(resource: ResourceDefinition): StoredResource {
  const table = resourceTables[resource.name];
  if (!table) throw notFound('CRUD resource');
  return { ...resource, table };
}
const conflict = (message: string) => new AppError(409, 'DATA_CONFLICT', message);
const records = (value: unknown): CrudRecord[] => JSON.parse(JSON.stringify(value)) as CrudRecord[];
function column(table: PgTable, name: string) {
  const result = getTableColumns(table)[name];
  if (!result) throw new Error('Unknown CRUD column.');
  return result;
}
const selection = (table: PgTable) => ({
  ...getTableColumns(table),
  updatedAt: sql<string>`to_char(${column(table, 'updatedAt')} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
});
const condition = (table: PgTable, key: CrudRecord) => {
  return and(...Object.entries(key).map(([name, value]) => eq(column(table, name), value)));
};
const project = (resource: ResourceDefinition, record: CrudRecord): CrudRecord =>
  Object.fromEntries(
    [
      ...new Set([...resource.keys, ...resource.fields.map((field) => field.name), 'updatedAt'])
    ].map((name) => [name, record[name] ?? null])
  );

// Inspect the existing FK definitions so the admin cannot accidentally invoke ON DELETE CASCADE.
async function assertNoDependents(db: Database, table: PgTable, row: CrudRecord) {
  const sourceColumns = getTableColumns(table);
  for (const dependent of Object.values(schema)) {
    if (!is(dependent, PgTable)) continue;
    for (const fk of getTableConfig(dependent).foreignKeys) {
      const reference = fk.reference();
      if (reference.foreignTable !== table) continue;
      const checks = reference.columns.map((column, index) => {
        const source = reference.foreignColumns[index];
        const property = Object.keys(sourceColumns).find((key) => sourceColumns[key] === source);
        return eq(column, row[property ?? '']);
      });
      const found = await db
        .select({ exists: sql`1` })
        .from(dependent)
        .where(and(...checks))
        .limit(1);
      if (found.length)
        throw conflict('This record has related data. Remove or reassign it first.');
    }
  }
}

async function validateRelations(
  db: Database,
  resource: StoredResource,
  next: CrudRecord,
  before?: CrudRecord
) {
  for (const field of resource.fields) {
    if (before && field.immutable && next[field.name] !== before[field.name])
      throw conflict('This field cannot be changed after creation.');
  }
  if (resource.name === 'teams' && before && next.seasonDivisionId !== before.seasonDivisionId) {
    await assertNoDependents(db, teams, before);
  }
  if (
    resource.name === 'competitions' &&
    before &&
    ['seasonName', 'divisionName'].some((field) => next[field] !== before[field])
  ) {
    await assertNoDependents(db, resource.table, before);
  }
  if (resource.name !== 'matches') return;
  const teamRows = await db
    .select()
    .from(teams)
    .where(or(eq(teams.id, String(next.team1Id)), eq(teams.id, String(next.team2Id))))
    .orderBy(asc(teams.id))
    .for('share');
  if (
    teamRows.length !== 2 ||
    teamRows.some((team) => team.seasonDivisionId !== next.idSeasonDivision)
  ) {
    throw conflict('Both teams must belong to the selected competition.');
  }
  if (!before) return;
  const imported = await db
    .select({ id: matchGames.id })
    .from(matchGames)
    .where(eq(matchGames.matchesId, String(before.id)))
    .limit(1);
  const resultFields = [
    'idSeasonDivision',
    'team1Id',
    'team2Id',
    'bestOf',
    'status',
    'winnerTeamId',
    'team1Score',
    'team2Score',
    'finishedAt'
  ];
  if (imported.length && resultFields.some((field) => next[field] !== before[field])) {
    throw conflict(
      'Imported maps own this match result. Only calendar, round, stream and notes can be edited.'
    );
  }
  if (['team1Id', 'team2Id'].some((field) => next[field] !== before[field])) {
    const votes = await db
      .select({ id: predictions.id })
      .from(predictions)
      .where(eq(predictions.matchId, String(before.id)))
      .limit(1);
    if (votes.length) throw conflict('Teams cannot change while predictions exist.');
  }
}

async function recordMovement(
  db: Database,
  mutation: CrudMutation,
  before: CrudRecord | undefined,
  after: CrudRecord
) {
  const actions: (typeof rosterMovements.$inferInsert.action)[] = [];
  if (mutation.action === 'create') actions.push('joined');
  else if (mutation.action === 'delete') actions.push('left');
  else {
    if (before?.role !== after.role) actions.push('role_changed');
    if (before?.isCaptain !== after.isCaptain)
      actions.push(after.isCaptain ? 'promoted_to_captain' : 'demoted_from_captain');
  }
  for (const action of actions)
    await db.insert(rosterMovements).values({
      teamId: String(after.teamId),
      discordUserId: String(after.discordUserId),
      actorId: mutation.actorId,
      action,
      role: after.role as typeof rosterMovements.$inferInsert.role
    });
}

export class PostgresCrudOperationsRepository implements CrudOperationsRepository {
  constructor(private readonly db: Database) {}

  async list(descriptor: ResourceDefinition, offset: number, search: string) {
    const resource = storedResource(descriptor);
    const projection = Object.fromEntries(
      [...new Set([...resource.keys, ...resource.fields.map((field) => field.name)])].map(
        (name) => [name, column(resource.table, name)]
      )
    );
    const searchable = Object.values(projection).map(
      (column) => sql`${column}::text ILIKE ${`%${search.replace(/[\\%_]/g, '\\$&')}%`}`
    );
    const result = records(
      await this.db
        .select({ ...projection, updatedAt: selection(resource.table).updatedAt })
        .from(resource.table)
        .where(search ? or(...searchable) : undefined)
        .orderBy(...resource.keys.map((key) => asc(column(resource.table, key))))
        .limit(51)
        .offset(offset)
    );
    const page = result.slice(0, 50);
    for (const field of resource.fields) {
      const reference = crudResources.find((entry) => entry.name === field.reference);
      if (!reference || !page.length) continue;
      const target = storedResource(reference);
      const key = target.keys[0];
      if (!key) continue;
      const lookupKey = (row: CrudRecord): CrudRecord => ({
        [key]: row[field.name] ?? null,
        ...(target.name === 'rounds' ? { idSeasonDivision: row.idSeasonDivision ?? null } : {})
      });
      const references = page.filter((row) => row[field.name] !== null);
      if (!references.length) continue;
      const related = records(
        await this.db
          .select()
          .from(target.table)
          .where(or(...references.map((row) => condition(target.table, lookupKey(row)))))
      );
      for (const row of page) {
        const identity = lookupKey(row);
        const match = related.find((entry) =>
          Object.entries(identity).every(([name, value]) => entry[name] === value)
        );
        if (match)
          row[`${field.name}Label`] =
            target.name === 'competitions'
              ? `${match.seasonName} · ${match.divisionName}`
              : target.name === 'users'
                ? `${match.username} · ${match.discordId}`
                : String(match.name ?? `Jornada ${match.id} · ${match.stage}`);
      }
    }
    return { records: page, hasMore: result.length > 50 };
  }

  async mutate(descriptor: ResourceDefinition, mutation: CrudMutation) {
    const resource = storedResource(descriptor);
    try {
      return await this.db.transaction(async (tx) => {
        let before: CrudRecord | undefined;
        if (mutation.action !== 'create') {
          [before] = records(
            await tx
              .select(selection(resource.table))
              .from(resource.table)
              .where(condition(resource.table, mutation.key))
              .for('update')
          );
          if (!before) throw notFound('Record');
          if (before.updatedAt !== mutation.version)
            throw conflict('This record changed. Reload it before saving.');
        }
        if (mutation.action === 'delete' && before)
          await assertNoDependents(tx, resource.table, before);
        else await validateRelations(tx, resource, { ...before, ...mutation.values }, before);
        const values: Record<string, CrudValue | Date> = { ...mutation.values };
        for (const field of resource.fields) {
          if (field.type === 'datetime' && typeof values[field.name] === 'string')
            values[field.name] = new Date(String(values[field.name]));
        }
        let result: unknown;
        if (mutation.action === 'create')
          result = await tx
            .insert(resource.table)
            .values(values)
            .returning(selection(resource.table));
        else if (mutation.action === 'update')
          result = await tx
            .update(resource.table)
            .set(values)
            .where(condition(resource.table, mutation.key))
            .returning(selection(resource.table));
        else
          result = await tx
            .delete(resource.table)
            .where(condition(resource.table, mutation.key))
            .returning(selection(resource.table));
        const after = records(result)[0];
        if (!after) throw notFound('Record');
        await tx.insert(auditLogs).values({
          actorDiscordUserId: mutation.actorId,
          action: `admin.${mutation.action}`,
          entityType: resource.name,
          entityId: typeof after.id === 'string' ? after.id : null,
          before: before ?? null,
          after: mutation.action === 'delete' ? null : after
        });
        if (resource.name === 'memberships') await recordMovement(tx, mutation, before, after);
        return project(resource, after);
      });
    } catch (error) {
      let cause: unknown = error;
      for (let depth = 0; depth < 5 && cause && typeof cause === 'object'; depth++) {
        if ('code' in cause && typeof cause.code === 'string') {
          if (cause.code === '23505')
            throw conflict('A record with these values already exists. Check the captain too.');
          if (cause.code === '23503')
            throw conflict('A related record is missing or still in use.');
          if (cause.code === '23514') throw conflict('These values violate a competition rule.');
          if (['40001', '40P01'].includes(cause.code))
            throw conflict('Concurrent change detected. Reload and retry.');
        }
        cause = 'cause' in cause ? cause.cause : undefined;
      }
      throw error;
    }
  }
}
