import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

const trustProxyNames = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isTrustProxyEntry(entry: string): boolean {
  if (trustProxyNames.has(entry)) return true;
  const [address, prefix, ...rest] = entry.split('/');
  if (rest.length > 0 || !address) return false;
  const version = isIP(address);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (version === 4 ? 32 : 128);
}

/**
 * Express `trust proxy` value. `false` ignores X-Forwarded-For; a number trusts
 * that many proxy hops; otherwise a comma-separated list of trusted proxy
 * addresses, subnets or the names loopback, linklocal and uniquelocal.
 * `true` (trust every hop) is rejected because clients could spoof their IP.
 */
const trustProxySchema = z
  .string()
  .default('loopback')
  .transform((value, ctx): false | number | string => {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === 'false') return false;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const entries = trimmed.split(',').map((entry) => entry.trim());
    if (entries.every(isTrustProxyEntry)) return entries.join(',');
    ctx.addIssue({ code: 'custom', message: 'Invalid trust proxy value' });
    return z.NEVER;
  });

const discordSignInKeys = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_REDIRECT_URI'
] as const;

/** Empty or unset means "not configured", so the consumer keeps its own default. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value : undefined));

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates the API configuration. Every setting the API reads goes through this schema;
 * modules receive the parsed values instead of reading `process.env`.
 */
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
      POSTGRES_BIN_DIR: z.string().default(''),
      CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
      DISCORD_CLIENT_ID: z.string().default(''),
      DISCORD_CLIENT_SECRET: z.string().default(''),
      DISCORD_REDIRECT_URI: z.string().default(''),
      DISCORD_BOT_WS_URL: z.string().default(''),
      DISCORD_BOT_WS_SUPERTOKEN: z.string().default(''),
      TRUST_PROXY: trustProxySchema,
      // Public site URL used in the sitemap; unset falls back to the production domain.
      FRONTEND_URL: optionalString.refine((value) => value === undefined || isHttpUrl(value), {
        message: 'Must be an http:// or https:// URL'
      }),
      // Built web app served by the API; unset serves only the API.
      WEB_DIST_DIR: optionalString,
      // Team logo directory; unset uses apps/web/public/images/teams_logo.
      TEAM_LOGO_DIR: z.string().optional(),
      // Editorial uploads, relative to the API working directory unless absolute.
      EDITORIAL_IMAGE_DIR: z.string().default('data/editorial-images')
    })
    .superRefine((env, ctx) => {
      // The bridge and the frontend origin do not depend on Discord sign-in: always checked.
      if (env.DISCORD_BOT_WS_URL.trim()) {
        try {
          const wsUrl = new URL(env.DISCORD_BOT_WS_URL);
          if (wsUrl.protocol !== 'ws:' && wsUrl.protocol !== 'wss:') {
            ctx.addIssue({
              code: 'custom',
              path: ['DISCORD_BOT_WS_URL'],
              message: 'Must be a ws:// or wss:// URL'
            });
          }
        } catch {
          ctx.addIssue({
            code: 'custom',
            path: ['DISCORD_BOT_WS_URL'],
            message: 'Invalid WebSocket URL'
          });
        }
      }
      const urlKeys: ('CORS_ORIGIN' | 'DISCORD_REDIRECT_URI')[] = ['CORS_ORIGIN'];
      if (discordSignInKeys.some((key) => env[key])) {
        for (const key of discordSignInKeys) {
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
        urlKeys.push('DISCORD_REDIRECT_URI');
      }
      for (const key of urlKeys) {
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
