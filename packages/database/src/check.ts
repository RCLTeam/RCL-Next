import { loadDatabaseUrl } from './environment.js';
import { createDatabase } from './index.js';
import { membershipIntegritySql } from './membership-integrity.js';

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
  if (process.argv.includes('--memberships')) {
    const issues = await connection.pool.query(membershipIntegritySql);
    console.table(issues.rows);
    console.info(`Membership integrity: ${issues.rows.length} issue(s). No data changed.`);
    if (issues.rows.length) process.exitCode = 1;
  }
} catch {
  console.error(
    'PostgreSQL check failed. Verify that the server is running and DATABASE_URL is configured correctly.'
  );
  process.exitCode = 1;
} finally {
  await connection.close();
}
