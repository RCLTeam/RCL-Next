import { Router, raw } from 'express';
import { type AuthOptions, requireAuth, requireTrustedOrigin } from '../auth/auth.router.js';
import { TeamLogosStore } from './team-logos.store.js';

export function teamLogosRouter(auth?: AuthOptions, store = new TeamLogosStore()): Router {
  const router = Router();
  router.use('/admin', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/images/:name', async (req, res, next) => {
    const file = await store.file(req.params.name);
    res.set('Cache-Control', 'public, max-age=3600, must-revalidate');
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(file, (error) => {
      if (error) next(error);
    });
  });
  if (!auth) {
    router.use((_req, res) => {
      res.status(503).json({ error: { message: 'La autenticación no está configurada.' } });
    });
    return router;
  }
  router.use('/admin', requireAuth(auth, 'admin'));
  router.get('/admin', async (_req, res) => res.json({ data: await store.list() }));
  router.use('/admin', requireTrustedOrigin(auth.frontendOrigin));
  router.post(
    '/admin/:name',
    raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }),
    async (req, res) => {
      res
        .status(201)
        .json({ data: await store.save(req.params.name, req.body, req.get('Content-Type')) });
    }
  );
  router.delete('/admin/:name', async (req, res) => {
    await store.remove(req.params.name);
    res.json({ data: null });
  });
  return router;
}
