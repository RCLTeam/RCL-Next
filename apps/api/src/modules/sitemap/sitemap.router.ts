import { type RequestHandler, Router } from 'express';
import type { SitemapService } from './processing/sitemap.service.js';

export function sitemapRouter(service: SitemapService): Router {
  const router = Router();

  const handleSitemap: RequestHandler = async (_req, res, next) => {
    try {
      const xml = await service.getSitemapXml();
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=43200');
      res.status(200).send(xml);
    } catch (error) {
      next(error);
    }
  };

  router.get('/', handleSitemap);
  router.get('/sitemap.xml', handleSitemap);

  return router;
}
