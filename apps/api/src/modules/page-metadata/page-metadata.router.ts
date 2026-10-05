import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderPageMetadata } from '@rcl/contracts';
import { Router, static as serveStatic } from 'express';
import helmet from 'helmet';
import type { PageMetadataService } from './page-metadata.service.js';

export function pageMetadataRouter(service: PageMetadataService): Router {
  const router = Router();
  router.get('/api/v1/page-metadata', async (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '/';
    const { metadata } = await service.resolve(path);
    // The endpoint describes the page, not the resource, so a missing page still answers 200.
    res.set('Cache-Control', 'no-store').json({ data: metadata });
  });
  return router;
}

// Serve the built template through the API so link previews receive metadata without JavaScript.
export function webPageRouter(directory: string, service: PageMetadataService): Router {
  const router = Router();
  const root = resolve(directory);
  router.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https:', 'wss:']
        }
      }
    })
  );
  router.use((req, res, next) => {
    if (req.path === '/index.html') return next();
    return serveStatic(root, { index: false })(req, res, next);
  });
  router.use(async (req, res, next) => {
    if (
      !['GET', 'HEAD'].includes(req.method) ||
      /^\/(api|health|ws|assets|images|fonts)(\/|$)/.test(req.path) ||
      !req.accepts('html')
    )
      return next();
    const html = await readFile(resolve(root, 'index.html'), 'utf8');
    const { metadata, found } = await service.resolve(req.path === '/index.html' ? '/' : req.path);
    // Unknown routes and missing records keep the same HTML, so the web renders its not-found
    // page, but answer 404 so that crawlers do not index them as valid pages.
    res
      .status(found ? 200 : 404)
      .set('Cache-Control', 'no-cache')
      .type('html')
      .send(renderPageMetadata(html, metadata));
  });
  return router;
}
