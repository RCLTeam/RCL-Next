import type { CrudDeleteDependency, CrudRecord, CrudValue } from '@rcl/contracts';
import { auditLogs, rosterMovements, teams } from '@rcl/database';
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
import {
  type ResourceDefinition,
  crudReferences,
  crudResources
} from './crud-operations.resources.js';
import {
  buildDeletePlan,
  deletePlannedDependents,
  lockDeletePlan
} from './postgres-crud-delete-plan.js';

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

function normalizeRecord(obj: Record<string, unknown>): CrudRecord {
  const result: CrudRecord = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      result[key] = typeof val === 'bigint' ? val.toString() : (val as CrudValue);
    }
  }
  return result;
}

function records(value: unknown): CrudRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeRecord(item as Record<string, unknown>));
}

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
async function findDependents(db: Database, table: PgTable, row: CrudRecord) {
  const sourceColumns = getTableColumns(table);
  const dependencies: CrudDeleteDependency[] = [];
  for (const dependent of Object.values(schema)) {
    if (!is(dependent, PgTable)) continue;
    const conditions = [];
    for (const fk of getTableConfig(dependent).foreignKeys) {
      const reference = fk.reference();
      if (reference.foreignTable !== table) continue;
      const checks = reference.columns.map((column, index) => {
        const source = reference.foreignColumns[index];
        const property = Object.keys(sourceColumns).find((key) => sourceColumns[key] === source);
        return eq(column, row[property ?? '']);
      });
      conditions.push(and(...checks));
    }
    if (!conditions.length) continue;
    const config = getTableConfig(dependent);
    // Only aggregate counts leave the database; never fetch related row contents here.
    const [found] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(dependent)
      .where(or(...conditions));
    if (!found?.count) continue;
    const descriptor = crudResources.find(
      (resource) => resourceTables[resource.name] === dependent
    );
    const labels: Record<string, string> = {
      matches: 'Encuentros',
      match_games: 'Partidas',
      player_game_info: 'Participaciones en partidas',
      player_game_stats: 'Estadísticas de partidas',
      player_game_build: 'Equipamiento de partidas',
      player_game_runes: 'Runas de partidas',
      predictions: 'Predicciones',
      roster_movements: 'Historial de plantillas'
    };
    dependencies.push({
      label: descriptor?.label ?? labels[config.name] ?? 'Otros datos relacionados',
      count: found.count
    });
  }
  return dependencies;
}

async function assertNoDependents(db: Database, table: PgTable, row: CrudRecord) {
  const dependencies = await findDependents(db, table, row);
  if (dependencies.length)
    throw new AppError(
      409,
      'RELATED_RECORDS',
      'This record has related data. Remove or reassign it first.',
      { dependencies }
    );
}

async function validateRelations(
  db: Database,
  resource: StoredResource,
  next: CrudRecord,
  before?: CrudRecord
) {
  if (resource.name === 'matches') {
    const participants = await db
      .select({ id: teams.id, seasonDivisionId: teams.seasonDivisionId })
      .from(teams)
      .where(or(eq(teams.id, String(next.team1Id)), eq(teams.id, String(next.team2Id))));
    if (
      participants.length !== 2 ||
      participants.some((team) => team.seasonDivisionId !== next.idSeasonDivision)
    )
      throw conflict(
        'Los dos equipos deben ser distintos y pertenecer a la competición seleccionada.'
      );
    if (
      before &&
      ['idSeasonDivision', 'team1Id', 'team2Id'].some((field) => next[field] !== before[field])
    )
      await assertNoDependents(db, resource.table, before);
  }
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

  async previewDelete(descriptor: ResourceDefinition, mutation: CrudMutation) {
    const resource = storedResource(descriptor);
    return this.db.transaction(async (tx) => {
      const role = await lockDeletePlan(tx, mutation.actorId, 'preview');
      const [before] = records(
        await tx
          .select(selection(resource.table))
          .from(resource.table)
          .where(condition(resource.table, mutation.key))
      );
      if (!before) throw notFound('Record');
      if (before.updatedAt !== mutation.version)
        throw conflict('This record changed. Reload it before deleting.');
      const { preview } = await buildDeletePlan(tx, resource.table, before);
      if (role !== 'owner')
        preview.allowed = (await findDependents(tx, resource.table, before)).length === 0;
      return preview;
    });
  }

  async list(descriptor: ResourceDefinition, offset: number, search: string) {
    const resource = storedResource(descriptor);
    const projection = Object.fromEntries(
      [...new Set([...resource.keys, ...resource.fields.map((field) => field.name)])].map(
        (name) => [name, column(resource.table, name)]
      )
    );

    const searchEscaped = search.replace(/[\\%_]/g, '\\$&');
    const searchPattern = `%${searchEscaped}%`;
    const conditions: ReturnType<typeof sql>[] = [];

    if (search) {
      const searchableNames = [
        ...new Set([
          ...resource.keys,
          ...resource.fields
            .filter(
              (field) => field.type === 'text' || field.type === 'select' || field.type === 'url'
            )
            .map((field) => field.name)
        ])
      ];

      for (const fieldName of searchableNames) {
        try {
          const col = column(resource.table, fieldName);
          if (col) {
            conditions.push(sql`${col}::text ILIKE ${searchPattern}`);
          }
        } catch {
          // Ignore if the column does not exist in the physical table
        }
      }
      for (const field of resource.fields) {
        if (!field.reference) continue;

        const refDescriptor = [...crudResources, ...crudReferences].find(
          (entry) => entry.name === field.reference
        );
        if (!refDescriptor) continue;

        const target = storedResource(refDescriptor);
        const localCol = column(resource.table, field.name);
        const primaryKeyName = target.keys[0];
        if (!localCol || !primaryKeyName) continue;

        const targetKeyCol = column(target.table, primaryKeyName);

        const targetSearchFields = target.fields
          .filter(
            (f) =>
              f.type === 'text' ||
              f.name === 'name' ||
              f.name === 'username' ||
              f.name === 'globalName'
          )
          .map((f) => f.name);

        const targetConditions: ReturnType<typeof sql>[] = [];
        for (const tName of targetSearchFields) {
          try {
            const tCol = column(target.table, tName);
            if (tCol) {
              targetConditions.push(sql`${tCol}::text ILIKE ${searchPattern}`);
            }
          } catch {
            // Ignore missing columns
          }
        }

        if (target.name === 'competitions') {
          targetConditions.push(
            sql`(${column(target.table, 'seasonName')} ILIKE ${searchPattern} OR ${column(target.table, 'divisionName')} ILIKE ${searchPattern})`
          );
        }

        if (targetConditions.length > 0) {
          conditions.push(
            sql`EXISTS (
              SELECT 1 FROM ${target.table}
              WHERE ${targetKeyCol} = ${localCol}
                AND (${or(...targetConditions)})
            )`
          );
        }
      }
    }

    const orderByClauses: ReturnType<typeof sql>[] = [];
    const primaryNameField = resource.fields.find(
      (f) => f.name === 'name' || f.name === 'username'
    )?.name;

    if (search && primaryNameField) {
      const nameCol = column(resource.table, primaryNameField);
      orderByClauses.push(
        sql`CASE 
          WHEN ${nameCol}::text ILIKE ${`${searchEscaped}%`} THEN 0 
          WHEN ${nameCol}::text ILIKE ${searchPattern} THEN 1 
          ELSE 2 
        END`
      );
    }

    orderByClauses.push(...resource.keys.map((key) => asc(column(resource.table, key))));

    const result = records(
      await this.db
        .select({ ...projection, updatedAt: selection(resource.table).updatedAt })
        .from(resource.table)
        .where(search && conditions.length > 0 ? or(...conditions) : undefined)
        .orderBy(...orderByClauses)
        .limit(51)
        .offset(offset)
    );

    const page = result.slice(0, 50);

    const referencePromises = resource.fields.map(async (field) => {
      const reference = [...crudResources, ...crudReferences].find(
        (entry) => entry.name === field.reference
      );
      if (!reference || !page.length) return null;

      const target = storedResource(reference);
      const key = target.keys[0];
      if (!key) return null;

      const lookupKey = (row: CrudRecord): CrudRecord => ({
        [key]: row[field.name] ?? null,
        ...(target.name === 'rounds' ? { idSeasonDivision: row.idSeasonDivision ?? null } : {})
      });

      const references = page.filter((row) => row[field.name] !== null);
      if (!references.length) return null;

      const related = records(
        await this.db
          .select(
            Object.fromEntries(
              [...new Set([...target.keys, ...target.fields.map((entry) => entry.name)])].map(
                (name) => [name, column(target.table, name)]
              )
            )
          )
          .from(target.table)
          .where(or(...references.map((row) => condition(target.table, lookupKey(row)))))
      );

      return { field, target, lookupKey, related };
    });

    const referenceResults = await Promise.all(referencePromises);

    for (const res of referenceResults) {
      if (!res) continue;
      const { field, target, lookupKey, related } = res;

      for (const row of page) {
        const identity = lookupKey(row);
        const match = related.find((entry) =>
          Object.entries(identity).every(([name, value]) => entry[name] === value)
        );
        if (match) {
          row[`${field.name}Label`] =
            target.name === 'competitions'
              ? `${match.seasonName} · ${match.divisionName}`
              : target.name === 'users'
                ? `${match.username} · ${match.discordId}`
                : String(match.name ?? `Jornada ${match.id} · ${match.stage}`);
        }
      }
    }

    return { records: page, hasMore: result.length > 50 };
  }

  async mutate(descriptor: ResourceDefinition, mutation: CrudMutation) {
    if (!crudResources.some((resource) => resource.name === descriptor.name))
      throw notFound('CRUD resource');
    const resource = storedResource(descriptor);
    try {
      return await this.db.transaction(async (tx) => {
        if (mutation.cascadeConfirmation) await lockDeletePlan(tx, mutation.actorId);
        let cascade: Awaited<ReturnType<typeof buildDeletePlan>> | undefined;
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
        if (mutation.action === 'delete' && before) {
          if (mutation.cascadeConfirmation) {
            cascade = await buildDeletePlan(tx, resource.table, before);
            if (cascade.preview.confirmation !== mutation.cascadeConfirmation)
              throw new AppError(
                409,
                'DELETE_PREVIEW_CHANGED',
                'Related data changed. Review a new deletion preview.'
              );
            if (!cascade.preview.allowed)
              throw conflict('Protected references prevent this deletion.');
            await deletePlannedDependents(tx, resource.table, cascade.deleted);
          } else await assertNoDependents(tx, resource.table, before);
        } else await validateRelations(tx, resource, { ...before, ...mutation.values }, before);
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
          before: cascade ? { record: before, cascade: cascade.preview } : (before ?? null),
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
