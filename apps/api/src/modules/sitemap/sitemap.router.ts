import { type RequestHandler, Router } from 'express';
import type { SitemapService } from './processing/sitemap.service.js';

/** Public sitemap paths: /sitemap.xml serves deployments without the reverse proxy. */
export const SITEMAP_PATHS = ['/sitemap.xml', '/api/sitemap.xml'] as const;

export function sitemapRouter(service: SitemapService): Router {
  const router = Router();

  const handleSitemap: RequestHandler = async (_req, res, next) => {
    try {
      const xml = await service.getSitemapXml();
      res.set('Content-Type', 'application/xml; charset=utf-8');
      // Short shared cache so admin changes are not hidden behind a proxy for hours.
      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).send(xml);
    } catch (error) {
      next(error);
    }
  };

  for (const path of SITEMAP_PATHS) router.get(path, handleSitemap);

  return router;
}
