import { readFile } from 'node:fs/promises';
import { createDatabase } from './index.js';
import { loadDatabaseUrl } from './environment.js';

const url = loadDatabaseUrl();
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error('Demo seed disabled. Set ALLOW_DEMO_SEED=true in a development/test environment only.');
}
const connection = createDatabase(url);
try {
  const script = await readFile(new URL('../seed/demo.sql', import.meta.url), 'utf8');
  const client = await connection.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(72160420)');
    await client.query(script);
    await client.query('COMMIT');
    console.info('Demo seed ready: season 10000000-0000-4000-8000-000000000001 (inactive, synthetic data).');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await connection.close();
}
