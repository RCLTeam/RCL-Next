import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(packageDirectory, '../../.env'), quiet: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString && !process.argv.includes('generate')) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env first.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  ...(connectionString ? { dbCredentials: { url: connectionString } } : {}),
  strict: true,
  verbose: true
});
