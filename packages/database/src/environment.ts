import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolves the same root .env from src and compiled dist, independent of cwd.
export const rootEnvironmentFile = fileURLToPath(new URL('../../../.env', import.meta.url));
export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export function loadDatabaseUrl(): string {
  config({ path: rootEnvironmentFile, quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required. Copy the root .env.example to .env.');
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
  return url;
}
