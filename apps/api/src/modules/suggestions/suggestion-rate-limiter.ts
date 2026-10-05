export interface RateLimitRule {
  /** Maximum submissions accepted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface SuggestionRateLimiterOptions {
  /** Limit for clients without a session, keyed by IP. Default: 3 per 10 minutes. */
  anonymous?: RateLimitRule | undefined;
  /** Limit for signed-in users, keyed by Discord ID. Default: 10 per 10 minutes. */
  authenticated?: RateLimitRule | undefined;
  /** Maximum number of tracked clients. Default: 10000. */
  maxClients?: number | undefined;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

interface WindowEntry {
  count: number;
  resetAt: number;
}

export const DEFAULT_ANONYMOUS_RATE_LIMIT: RateLimitRule = { limit: 3, windowMs: 10 * 60 * 1000 };
export const DEFAULT_AUTHENTICATED_RATE_LIMIT: RateLimitRule = {
  limit: 10,
  windowMs: 10 * 60 * 1000
};
export const DEFAULT_RATE_LIMIT_MAX_CLIENTS = 10_000;

/**
 * Fixed-window, in-memory submission limiter. The number of tracked clients is
 * bounded: expired windows are pruned when the table is full, and if it is
 * still full the request is refused instead of growing the table.
 */
export class SuggestionRateLimiter {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly anonymous: RateLimitRule;
  private readonly authenticated: RateLimitRule;
  private readonly maxClients: number;

  constructor(options: SuggestionRateLimiterOptions = {}) {
    this.anonymous = options.anonymous ?? DEFAULT_ANONYMOUS_RATE_LIMIT;
    this.authenticated = options.authenticated ?? DEFAULT_AUTHENTICATED_RATE_LIMIT;
    this.maxClients = options.maxClients ?? DEFAULT_RATE_LIMIT_MAX_CLIENTS;
  }

  /** Counts one submission for `key` and reports whether it is allowed. */
  public consume(key: string, isAuthenticated: boolean, now: number = Date.now()): RateLimitResult {
    const rule = isAuthenticated ? this.authenticated : this.anonymous;
    const entry = this.windows.get(key);

    if (!entry || now >= entry.resetAt) {
      if (!entry && this.windows.size >= this.maxClients) {
        this.prune(now);
        if (this.windows.size >= this.maxClients) {
          return { allowed: false, retryAfterSeconds: Math.ceil(rule.windowMs / 1000) };
        }
      }
      this.windows.set(key, { count: 1, resetAt: now + rule.windowMs });
      return { allowed: true };
    }

    if (entry.count >= rule.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      };
    }

    entry.count += 1;
    return { allowed: true };
  }

  public size(): number {
    return this.windows.size;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.windows) {
      if (now >= entry.resetAt) {
        this.windows.delete(key);
      }
    }
  }
}
