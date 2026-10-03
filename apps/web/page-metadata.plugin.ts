import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type PageMetadata, getPageMetadata, renderPageMetadata } from '@rcl/contracts';
import type { Plugin } from 'vite';

async function metadataForPath(path: string): Promise<PageMetadata> {
  if (/^\/(equipos|jugadores|partidos|editorial)\/[^/]+\/?$/.test(path)) {
    try {
      const response = await fetch(
        `http://127.0.0.1:3001/api/v1/page-metadata?path=${encodeURIComponent(path)}`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (response.ok) {
        const result: { data: PageMetadata } = await response.json();
        return result.data;
      }
    } catch {
      /* Keep the route description when the local API is unavailable. */
    }
  }
  return getPageMetadata(path);
}

export function pageMetadataPlugin(): Plugin {
  return {
    name: 'page-metadata',
    async transformIndexHtml(html, context) {
      const path = new URL(context.originalUrl ?? '/', 'http://localhost').pathname;
      return renderPageMetadata(html, await metadataForPath(path));
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (
          !['GET', 'HEAD'].includes(req.method ?? '') ||
          path.startsWith('/api/') ||
          /\.[a-z0-9]+$/i.test(path)
        )
          return next();
        try {
          const html = await readFile(
            resolve(server.config.root, server.config.build.outDir, 'index.html'),
            'utf8'
          );
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(renderPageMetadata(html, await metadataForPath(path)));
        } catch (error) {
          next(error);
        }
      });
    }
  };
}
