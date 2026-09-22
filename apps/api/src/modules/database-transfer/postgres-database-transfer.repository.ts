import { createHash } from 'node:crypto';
import type { DatabaseImportPreview } from '@rcl/contracts';
import * as schema from '@rcl/database/schema';
import { type SQL, eq, is, sql } from 'drizzle-orm';
import {
  type PgDatabase,
  type PgQueryResultHKT,
  PgTable,
  getTableConfig
} from 'drizzle-orm/pg-core';
import { AppError } from '../../shared/app-error.js';
import type { DatabaseTransferRepository } from './database-transfer.repository.js';
import { MAX_DATABASE_BACKUP_BYTES } from './database-transfer.service.js';
import type { PostgresBackupTools } from './postgres-backup-tools.js';
import { parseCopyBackup } from './postgres-copy-backup.js';

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
type BackupRow = Record<string, unknown>;
type BackupTables = Record<string, BackupRow[]>;
async function queryRows<T>(db: Database, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  if (!result || typeof result !== 'object' || !('rows' in result) || !Array.isArray(result.rows))
    throw new Error('Unexpected PostgreSQL query result.');
  return result.rows as T[];
}
const tables: PgTable[] = Object.values(schema)
  .flatMap((value) => (is(value, PgTable) ? [value] : []))
  .sort((a, b) => getTableConfig(a).name.localeCompare(getTableConfig(b).name));
const tableNames = tables.map((table) => getTableConfig(table).name);
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function parseBackup(source: string) {
  const expected = Object.fromEntries(
    tables.map((table) => {
      const config = getTableConfig(table);
      return [`public.${config.name}`, config.columns.map((column) => column.name)];
    })
  );
  expected['drizzle.__drizzle_migrations'] = ['id', 'hash', 'created_at'];
  const parsed = parseCopyBackup(source, expected);
  const content: BackupTables = {};
  for (const table of tables) {
    const config = getTableConfig(table);
    content[config.name] = (parsed[`public.${config.name}`] ?? []).map((row) => {
      const converted: BackupRow = { ...row };
      for (const column of config.columns)
        if (column.dataType === 'json' && row[column.name] !== null) {
          try {
            converted[column.name] = JSON.parse(row[column.name] ?? 'null');
          } catch {
            throw new AppError(
              422,
              'INVALID_BACKUP_DATA',
              'The backup contains invalid JSON data.'
            );
          }
        }
      return converted;
    });
  }
  return { tables: content, migrations: parsed['drizzle.__drizzle_migrations'] ?? [] };
}

const insertOrder: PgTable[] = [];
const visited = new Set<PgTable>();
function visit(table: PgTable) {
  if (visited.has(table)) return;
  visited.add(table);
  for (const fk of getTableConfig(table).foreignKeys) visit(fk.reference().foreignTable);
  insertOrder.push(table);
}
for (const table of tables) visit(table);

async function actor(db: Database, actorId: string, owner: boolean) {
  const [user] = await db
    .select()
    .from(schema.discordUsers)
    .where(eq(schema.discordUsers.discordId, actorId));
  if (!user || (owner ? user.role !== 'owner' : !['admin', 'owner'].includes(user.role)))
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions for database transfer.');
  return user;
}

async function snapshot(db: Database): Promise<BackupTables> {
  const result: BackupTables = {};
  let bytes = 1024;
  for (const table of tables) {
    const config = getTableConfig(table);
    const primary = [
      ...config.columns.filter((column) => column.primary),
      ...config.primaryKeys.flatMap((key) => key.columns)
    ];
    if (!primary.length) throw new Error('Backup table has no primary key.');
    const rows: BackupRow[] = [];
    for (let offset = 0; ; offset += 500) {
      // PostgreSQL JSON conversion preserves timestamp microseconds and JSON columns.
      const page = await queryRows<{ row: BackupRow }>(
        db,
        sql`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY ${sql.join(
          primary.map((column) => sql.identifier(column.name)),
          sql`, `
        )} LIMIT 500 OFFSET ${offset}`
      );
      for (const item of page) {
        bytes += Buffer.byteLength(JSON.stringify(item.row)) + 1;
        if (bytes > MAX_DATABASE_BACKUP_BYTES)
          throw new AppError(
            413,
            'BACKUP_TOO_LARGE',
            'The database exceeds the 64 MiB web backup limit.'
          );
        rows.push(item.row);
      }
      if (page.length < 500) break;
    }
    result[config.name] = rows;
  }
  return result;
}

async function lockImport(db: Database) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(72160419)`);
  await db.execute(
    sql`LOCK TABLE ${sql.join(
      tables.map((table) => sql`${table}`),
      sql`, `
    )} IN ACCESS EXCLUSIVE MODE NOWAIT`
  );
  await db.execute(sql`SET LOCAL statement_timeout = '60s'`);
}

async function replaceData(
  db: Database,
  content: BackupTables,
  owner: typeof schema.discordUsers.$inferSelect,
  fileHash: string
) {
  await db.execute(
    sql`TRUNCATE TABLE ${sql.join(
      tables.map((table) => sql`${table}`),
      sql`, `
    )}`
  );
  for (const table of insertOrder) {
    const name = getTableConfig(table).name;
    const rows = content[name] ?? [];
    const columns = getTableConfig(table).columns.map((column) => sql.identifier(column.name));
    for (let offset = 0; offset < rows.length; offset += 200) {
      await db.execute(
        sql`INSERT INTO ${table} (${sql.join(columns, sql`, `)}) SELECT ${sql.join(columns, sql`, `)} FROM jsonb_populate_recordset(NULL::${table}, ${JSON.stringify(rows.slice(offset, offset + 200))}::jsonb)`
      );
    }
  }
  // Never reinstate old sessions or remove the owner's ability to sign in after a restore.
  await db.delete(schema.authSessions);
  await db.delete(schema.oauthStates);
  await db
    .insert(schema.discordUsers)
    .values(owner)
    .onConflictDoUpdate({ target: schema.discordUsers.discordId, set: { role: 'owner' } });
  await db.insert(schema.auditLogs).values({
    actorDiscordUserId: owner.discordId,
    action: 'database-transfer.import',
    entityType: 'database',
    after: {
      fileHash,
      tables: Object.fromEntries(tableNames.map((name) => [name, content[name]?.length ?? 0]))
    }
  });
  await db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
}

async function safeOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) throw error;
    let cause: unknown = error;
    for (let depth = 0; depth < 5 && cause && typeof cause === 'object'; depth++) {
      if ('code' in cause && typeof cause.code === 'string') {
        if (['55P03', '40P01', '40001', '57014'].includes(cause.code))
          throw new AppError(409, 'DATABASE_BUSY', 'The database is busy. Retry the operation.');
        if (cause.code.startsWith('22') || cause.code.startsWith('23'))
          throw new AppError(
            422,
            'INVALID_BACKUP_DATA',
            'The backup violates database types or relationships. No data was imported.'
          );
      }
      cause = 'cause' in cause ? cause.cause : undefined;
    }
    throw error;
  }
}

export class PostgresDatabaseTransferRepository implements DatabaseTransferRepository {
  constructor(
    private readonly db: Database,
    private readonly tools: PostgresBackupTools
  ) {}
  async exportDatabase(actorId: string): Promise<Buffer> {
    await actor(this.db, actorId, false);
    const backup = await this.tools.exportDump();
    await actor(this.db, actorId, false);
    return backup;
  }
  private async prepare(
    db: Database,
    backup: Buffer,
    actorId: string,
    archive: ReturnType<typeof parseBackup>,
    exportedAt: string | null
  ) {
    await lockImport(db);
    const owner = await actor(db, actorId, true);
    const migrations = await queryRows<{ hash: string; created_at: string }>(
      db,
      sql`SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at`
    );
    const normalize = (rows: Record<string, unknown>[]) =>
      rows
        .map((row) => `${row.created_at}:${row.hash}`)
        .sort()
        .join(',');
    if (normalize(archive.migrations) !== normalize(migrations))
      throw new AppError(
        422,
        'INCOMPATIBLE_BACKUP',
        'The backup migration history does not match the current database.'
      );
    const current = await snapshot(db);
    const fileHash = digest(backup);
    const confirmation = digest(JSON.stringify({ fileHash, actorId, current }));
    const preview: DatabaseImportPreview = {
      confirmation,
      exportedAt,
      tables: tableNames.map((table) => ({
        table,
        currentRows: current[table]?.length ?? 0,
        importedRows: archive.tables[table]?.length ?? 0
      }))
    };
    return { owner, archive, fileHash, preview };
  }
  async previewImport(backup: Buffer, actorId: string): Promise<DatabaseImportPreview> {
    await actor(this.db, actorId, true);
    const extracted = await this.tools.readDump(backup);
    const archive = parseBackup(extracted.data);
    return safeOperation(() =>
      this.db.transaction(async (tx) => {
        const prepared = await this.prepare(tx, backup, actorId, archive, extracted.exportedAt);
        await tx.execute(sql`SAVEPOINT validate_backup`);
        await replaceData(tx, prepared.archive.tables, prepared.owner, prepared.fileHash);
        await tx.execute(sql`ROLLBACK TO SAVEPOINT validate_backup`);
        return prepared.preview;
      })
    );
  }
  async importDatabase(backup: Buffer, confirmation: string, actorId: string) {
    await actor(this.db, actorId, true);
    const extracted = await this.tools.readDump(backup);
    const archive = parseBackup(extracted.data);
    return safeOperation(() =>
      this.db.transaction(async (tx) => {
        const prepared = await this.prepare(tx, backup, actorId, archive, extracted.exportedAt);
        if (prepared.preview.confirmation !== confirmation)
          throw new AppError(
            409,
            'IMPORT_PREVIEW_CHANGED',
            'The file or database changed. Review a new import preview.'
          );
        await replaceData(tx, prepared.archive.tables, prepared.owner, prepared.fileHash);
        return { importedAt: new Date().toISOString() };
      })
    );
  }
}
