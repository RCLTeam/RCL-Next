import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.js';

export function createDatabase(connectionString: string) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    application_name: 'rcl-api'
  });
  const db = drizzle({ client: pool, schema });
  return { db, pool, close: () => pool.end() };
}

export type Database = ReturnType<typeof createDatabase>['db'];

export * from './schema.js';
