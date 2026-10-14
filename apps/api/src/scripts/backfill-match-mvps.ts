import { fileURLToPath } from 'node:url';
import { createDatabase } from '@rcl/database';
import { config } from 'dotenv';
import { backfillMatchMvps } from '../modules/competition/backfill-match-mvps.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--apply', '--dry-run'].includes(arg)) || args.length > 1) {
    throw new Error('Usage: pnpm mvp:backfill [--dry-run | --apply]');
  }
  config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error('DATABASE_URL is required; configure the root .env or the environment.');
  const connection = createDatabase(url);
  try {
    const { rows } = await connection.pool.query('SELECT current_database() AS database');
    const result = await backfillMatchMvps(connection.db, args.includes('--apply'));
    console.info(JSON.stringify({ database: rows[0]?.database, ...result }, null, 2));
    if (result.unresolved > 0) process.exitCode = 2;
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  // Database driver errors can contain connection details; never print credentials.
  console.error(
    error instanceof Error &&
      (error.message.startsWith('DATABASE_URL') || error.message.startsWith('Usage:'))
      ? error.message
      : 'MVP backfill failed. Check connectivity, migration 0002 and database permissions. Completed series can be safely retried.'
  );
  process.exitCode = 1;
});
