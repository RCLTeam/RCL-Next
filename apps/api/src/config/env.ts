import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export function loadEnvironment() {
  config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
  const result = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url().refine(value => /^postgres(ql)?:/.test(value)),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().default('127.0.0.1'),
    CORS_ORIGIN: z.string().url().default('http://localhost:5173')
  }).safeParse(process.env);
  if (!result.success) throw new Error('Invalid environment: ' + result.error.issues.map(issue => issue.path.join('.')).join(', '));
  return result.data;
}
