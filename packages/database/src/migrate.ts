import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadDatabaseUrl, migrationsFolder } from './environment.js';
import { createDatabase } from './index.js';

const connection = createDatabase(loadDatabaseUrl());
try {
  // Dedicated session serializes migration runners. Never reset an existing DB.
  const client = await connection.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(72160419)');
    const { rows } = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.seasons') IS NOT NULL AS exists"
    );
    const tracking = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists"
    );
    if (rows[0]?.exists && !tracking.rows[0]?.exists) {
      throw new Error(
        'Existing untracked schema detected. Use a new empty database; do not baseline production automatically.'
      );
    }
    if (tracking.rows[0]?.exists) {
      const applied = await client.query<{ hash: string }>(
        'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at'
      );
      const files = readMigrationFiles({ migrationsFolder });
      if (applied.rows.some((row, index) => row.hash !== files[index]?.hash)) {
        throw new Error(
          'Migration history differs from these files. Plan an explicit upgrade; existing data was not modified.'
        );
      }
    }
    await migrate(connection.db, { migrationsFolder });
    await connection.db.execute(sql`select 1`);
    console.info('PostgreSQL migrations applied.');
  } finally {
    await client.query('SELECT pg_advisory_unlock(72160419)');
    client.release();
  }
} finally {
  await connection.close();
}
