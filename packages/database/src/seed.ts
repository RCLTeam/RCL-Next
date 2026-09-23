import { readFile } from 'node:fs/promises';
import { loadDatabaseUrl } from './environment.js';
import { createDatabase } from './index.js';

const url = loadDatabaseUrl();
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error(
    'Demo seed disabled. Set ALLOW_DEMO_SEED=true in a development/test environment only.'
  );
}
const connection = createDatabase(url);
try {
  const script = await readFile(new URL('../seed/demo.sql', import.meta.url), 'utf8');
  const showcase = await readFile(new URL('../seed/showcase.sql', import.meta.url), 'utf8');
  const client = await connection.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(72160420)');
    await client.query(script);
    await client.query(showcase);
    await client.query('COMMIT');
    console.info(
      'Demo showcase ready: Temporada DEMO — datos ficticios. Includes BO3/BO5 series, live matches and full player statistics in both divisions.'
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await connection.close();
}
