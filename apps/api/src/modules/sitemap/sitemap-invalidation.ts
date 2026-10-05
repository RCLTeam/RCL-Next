import type { RequestHandler } from 'express';
import type { SitemapService } from './processing/sitemap.service.js';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Clears the cached sitemap once a write request has been answered successfully, so new or
 * renamed teams, players and published articles appear on the next sitemap request.
 * Rejected writes (status >= 400) keep the cache.
 */
export function invalidateSitemapOnWrite(service: SitemapService): RequestHandler {
  return (req, res, next) => {
    if (!READ_ONLY_METHODS.has(req.method)) {
      res.on('finish', () => {
        if (res.statusCode < 400) service.invalidateCache();
      });
    }
    next();
  };
}
