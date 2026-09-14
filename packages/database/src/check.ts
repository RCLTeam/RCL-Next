import { loadDatabaseUrl } from './environment.js';
import { createDatabase } from './index.js';

const connection = createDatabase(loadDatabaseUrl());
try {
  const result = await connection.pool.query(
    'SELECT current_database() AS database, current_user AS username, version() AS version'
  );
  console.info(result.rows[0]);
  const tables = await connection.pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  console.table(tables.rows);
} catch {
  console.error(
    'PostgreSQL check failed. Start the server (docker compose up -d --wait postgres) and verify DATABASE_URL in the root .env.'
  );
  process.exitCode = 1;
} finally {
  await connection.close();
}
