import { Router, raw } from 'express';
import { notFound } from '../../shared/app-error.js';
import { type AuthOptions, requireAuth, requireTrustedOrigin } from '../auth/auth.router.js';
import { EditorialImageStore } from './editorial-image.store.js';
import type { HomeContentService } from './home-content.service.js';

export function homeContentRouter(
  service: HomeContentService,
  auth?: AuthOptions,
  images = new EditorialImageStore()
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/images/:name', (req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(images.path(req.params.name), (error) => {
      if (error) next('code' in error && error.code === 'ENOENT' ? notFound('Image') : error);
    });
  });
  router.get('/articles', async (_req, res) => res.json({ data: await service.listArticles() }));
  router.get('/articles/:id', async (req, res) =>
    res.json({ data: await service.article(req.params.id) })
  );
  router.get('/weekly-teams/:id/rounds', async (req, res) =>
    res.json({ data: await service.listWeeklyTeams(req.params.id) })
  );
  router.get('/weekly-teams/:id', async (req, res) =>
    res.json({ data: await service.weeklyTeam(req.params.id) })
  );
  if (auth) {
    router.use('/admin', requireAuth(auth, 'admin'));
    router.get('/admin/articles', async (_req, res) =>
      res.json({ data: await service.listArticles(true) })
    );
    router.get('/admin/weekly-teams/:id/rounds', async (req, res) =>
      res.json({ data: await service.listWeeklyTeams(req.params.id, true) })
    );
    router.get('/admin/weekly-teams/:id/candidates/:roundId', async (req, res) =>
      res.json({ data: await service.weeklyCandidates(req.params.id, req.params.roundId) })
    );
    router.get('/admin/weekly-teams/:id', async (req, res) =>
      res.json({ data: await service.weeklyTeam(req.params.id, true) })
    );
    router.use('/admin', requireTrustedOrigin(auth.frontendOrigin));
    router.post(
      '/admin/images',
      raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }),
      async (req, res) => {
        res.status(201).json({ data: await images.save(req.body, req.get('Content-Type')) });
      }
    );
    router.post('/admin/articles', async (req, res) =>
      res.status(201).json({
        data: await service.saveArticle(String(res.locals.user.discordId), null, req.body)
      })
    );
    router.put('/admin/articles/:id', async (req, res) =>
      res.json({
        data: await service.saveArticle(String(res.locals.user.discordId), req.params.id, req.body)
      })
    );
    router.delete('/admin/articles/:id', async (req, res) => {
      await service.deleteArticle(String(res.locals.user.discordId), req.params.id);
      res.json({ data: null });
    });
    router.put('/admin/weekly-teams/:id', async (req, res) =>
      res.json({
        data: await service.saveWeeklyTeam(
          String(res.locals.user.discordId),
          req.params.id,
          req.body
        )
      })
    );
  }
  return router;
}
