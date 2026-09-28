import { createHash } from 'node:crypto';
import type { CrudDeleteImpact, CrudDeletePreview, CrudRecord } from '@rcl/contracts';
import * as schema from '@rcl/database/schema';
import { and, eq, getTableColumns, is, or, sql } from 'drizzle-orm';
import {
  type PgDatabase,
  type PgQueryResultHKT,
  PgTable,
  getTableConfig
} from 'drizzle-orm/pg-core';
import { AppError } from '../../shared/app-error.js';

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
type Rows = Map<string, CrudRecord>;

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Incomplete deletion graph metadata.');
  return value;
}

const tables: PgTable[] = Object.values(schema)
  .flatMap((value) => (is(value, PgTable) ? [value] : []))
  .sort((a, b) => getTableConfig(a).name.localeCompare(getTableConfig(b).name));

interface FKEdge {
  childTable: PgTable;
  parentTable: PgTable;
  fk: ReturnType<typeof getTableConfig>['foreignKeys'][number];
  onDelete: string | undefined;
}

const fkGraphByParent = new Map<PgTable, FKEdge[]>();

for (const table of tables) {
  const config = getTableConfig(table);
  for (const fk of config.foreignKeys) {
    const parent = fk.reference().foreignTable;
    let edges = fkGraphByParent.get(parent);
    if (!edges) {
      edges = [];
      fkGraphByParent.set(parent, edges);
    }
    edges.push({
      childTable: table,
      parentTable: parent,
      fk,
      onDelete: fk.onDelete
    });
  }
}

const serialize = (value: unknown): CrudRecord[] =>
  JSON.parse(JSON.stringify(value)) as CrudRecord[];

function key(table: PgTable, row: CrudRecord): CrudRecord {
  const config = getTableConfig(table);
  const columns = getTableColumns(table);
  const primary = [
    ...config.columns.filter((column) => column.primary),
    ...config.primaryKeys.flatMap((pk) => pk.columns)
  ];
  if (!primary.length) throw new Error('Missing primary key for deletion plan.');
  const entries = Object.entries(columns).filter(([, column]) =>
    primary.some((pk) => pk.name === column.name)
  );
  if (!entries.length) throw new Error('Cannot delete without a primary key condition.');
  return Object.fromEntries(
    entries.map(([name]) => {
      const value = required(row[name]);
      if (value === null) throw new Error('Cannot delete with a null primary key.');
      return [name, value];
    })
  );
}

const identity = (table: PgTable, row: CrudRecord) => JSON.stringify(key(table, row));
const matches = (table: PgTable, row: CrudRecord) =>
  and(
    ...Object.entries(key(table, row)).map(([name, value]) =>
      eq(required(getTableColumns(table)[name]), value)
    )
  );

export async function lockDeletePlan(
  db: Database,
  actorId: string,
  purpose: 'preview' | 'delete' = 'delete'
) {
  let actor: { role: string } | undefined;
  try {
    const rows = await db
      .select({ role: schema.discordUsers.role })
      .from(schema.discordUsers)
      .where(eq(schema.discordUsers.discordId, actorId))
      .for(purpose === 'delete' ? 'update' : 'share', { noWait: true });

    actor = rows[0];
  } catch (error) {
    let cause: unknown = error;
    for (let depth = 0; depth < 5 && cause && typeof cause === 'object'; depth++) {
      if ('code' in cause && (cause.code === '55P03' || cause.code === '40P01'))
        throw new AppError(
          409,
          'DATA_CONFLICT',
          'Another operation is changing data. Retry the deletion preview.'
        );
      cause = 'cause' in cause ? cause.cause : undefined;
    }
    throw error;
  }

  if (actor?.role !== 'owner' && !(purpose === 'preview' && actor?.role === 'admin'))
    throw new AppError(403, 'FORBIDDEN', 'Only an owner can delete related data.');

  return actor.role;
}

export async function buildDeletePlan(db: Database, root: PgTable, row: CrudRecord) {
  const deleted = new Map<PgTable, Rows>([[root, new Map([[identity(root, row), row]])]]);
  let size = 1;

  async function dependents(
    table: PgTable,
    parent: PgTable,
    rows: CrudRecord[],
    fk: ReturnType<typeof getTableConfig>['foreignKeys'][number]
  ) {
    const reference = fk.reference();
    const source = getTableColumns(parent);
    const properties = reference.foreignColumns.map((column) =>
      required(Object.keys(source).find((name) => source[name] === column))
    );
    const result: CrudRecord[] = [];
    for (let start = 0; start < rows.length; start += 100) {
      const found = serialize(
        await db
          .select()
          .from(table)
          .where(
            or(
              ...rows
                .slice(start, start + 100)
                .map((row) =>
                  and(
                    ...reference.columns.map((column, index) =>
                      eq(column, required(row[required(properties[index])]))
                    )
                  )
                )
            )
          )
          .limit(10001)
      );
      result.push(...found);
      if (result.length > 10000)
        throw new AppError(
          422,
          'DELETE_TOO_LARGE',
          'Deletion exceeds the 10000-row preview limit. Delete smaller groups first.'
        );
    }
    return result;
  }

  let frontier = new Map(deleted);
  while (frontier.size) {
    const next = new Map<PgTable, Rows>();
    for (const [parent, rows] of frontier) {
      const edges = fkGraphByParent.get(parent) ?? [];
      for (const { childTable, fk, onDelete } of edges) {
        if (onDelete !== 'cascade') continue;
        for (const row of await dependents(childTable, parent, [...rows.values()], fk)) {
          const id = identity(childTable, row);
          if (deleted.get(childTable)?.has(id)) continue;
          if (++size > 10000)
            throw new AppError(
              422,
              'DELETE_TOO_LARGE',
              'Deletion exceeds the 10000-row preview limit. Delete smaller groups first.'
            );
          if (!deleted.has(childTable)) deleted.set(childTable, new Map());
          required(deleted.get(childTable)).set(id, row);
          if (!next.has(childTable)) next.set(childTable, new Map());
          required(next.get(childTable)).set(id, row);
        }
      }
    }
    frontier = next;
  }

  const effects = new Map<
    string,
    { table: PgTable; action: CrudDeleteImpact['action']; rows: Rows }
  >();
  for (const [table, rows] of deleted)
    effects.set(`${getTableConfig(table).name}:delete`, { table, action: 'delete', rows });

  for (const [parent, rows] of deleted) {
    const edges = fkGraphByParent.get(parent) ?? [];
    for (const { childTable, fk, onDelete } of edges) {
      if (onDelete === 'cascade') continue;
      const action =
        onDelete === 'set null' && fk.reference().columns.every((column) => !column.notNull)
          ? 'set-null'
          : 'blocked';
      for (const row of await dependents(childTable, parent, [...rows.values()], fk)) {
        const id = identity(childTable, row);
        if (deleted.get(childTable)?.has(id)) continue;
        const group = `${getTableConfig(childTable).name}:${action}`;
        if (!effects.has(group)) effects.set(group, { table: childTable, action, rows: new Map() });
        required(effects.get(group)).rows.set(id, row);
      }
    }
  }

  const stable = [...effects.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, effect]) => ({
      ...effect,
      rows: [...effect.rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row)
    }));

  const impacts = stable.map(({ table, action, rows }) => ({
    table: getTableConfig(table).name,
    action,
    count: rows.length,
    examples: rows.slice(0, 5).map((row) => key(table, row))
  }));

  const confirmation = createHash('sha256')
    .update(
      JSON.stringify(
        stable.map(({ table, action, rows }) => ({
          table: getTableConfig(table).name,
          action,
          rows
        }))
      )
    )
    .digest('hex');

  const preview: CrudDeletePreview = {
    confirmation,
    impacts,
    allowed: !impacts.some((impact) => impact.action === 'blocked')
  };

  return { preview, deleted };
}

export async function deletePlannedDependents(
  db: Database,
  root: PgTable,
  deleted: Map<PgTable, Rows>
) {
  const visited = new Set<PgTable>();
  async function remove(table: PgTable) {
    if (visited.has(table)) return;
    visited.add(table);
    for (const dependent of deleted.keys()) {
      if (getTableConfig(dependent).foreignKeys.some((fk) => fk.reference().foreignTable === table))
        await remove(dependent);
    }
    if (table === root) return;
    const rows = [...(deleted.get(table)?.values() ?? [])];
    for (let start = 0; start < rows.length; start += 100)
      await db
        .delete(table)
        .where(or(...rows.slice(start, start + 100).map((row) => matches(table, row))));
  }
  await remove(root);
}
