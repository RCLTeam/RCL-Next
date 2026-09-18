import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

export function parseEnvironment(environment: NodeJS.ProcessEnv) {
  const result = z
    .object({
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      DATABASE_URL: z
        .string()
        .url()
        .refine((value) => /^postgres(ql)?:/.test(value)),
      PORT: z.coerce.number().int().min(1).max(65535).default(3001),
      HOST: z.string().default('127.0.0.1'),
      CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
      DISCORD_CLIENT_ID: z.string().default(''),
      DISCORD_CLIENT_SECRET: z.string().default(''),
      DISCORD_REDIRECT_URI: z.string().default('')
    })
    .superRefine((env, ctx) => {
      const keys = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI'] as const;
      if (!keys.some((key) => env[key])) return;
      for (const key of keys) {
        if (!env[key].trim())
          ctx.addIssue({ code: 'custom', path: [key], message: 'Required for Discord sign-in' });
      }
      if (!/^\d{17,20}$/.test(env.DISCORD_CLIENT_ID)) {
        ctx.addIssue({
          code: 'custom',
          path: ['DISCORD_CLIENT_ID'],
          message: 'Invalid Discord client ID'
        });
      }
      for (const key of ['CORS_ORIGIN', 'DISCORD_REDIRECT_URI'] as const) {
        try {
          const url = new URL(env[key]);
          const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
          if (
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            (url.protocol !== 'https:' &&
              !(env.NODE_ENV !== 'production' && local && url.protocol === 'http:')) ||
            (key === 'CORS_ORIGIN' && env[key] !== url.origin) ||
            (key === 'DISCORD_REDIRECT_URI' && url.pathname !== '/api/v1/auth/discord/callback')
          ) {
            throw new Error('Invalid URL');
          }
        } catch {
          ctx.addIssue({ code: 'custom', path: [key], message: 'Invalid authentication URL' });
        }
      }
    })
    .safeParse(environment);
  if (!result.success)
    throw new Error(
      `Invalid environment: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`
    );
  return result.data;
}

export function loadEnvironment() {
  config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
  return parseEnvironment(process.env);
}
