import { Router } from 'express';
import { type AuthOptions, requireAuth, requireTrustedOrigin } from '../auth/auth.router.js';
import type { HomeContentService } from './home-content.service.js';

export function homeContentRouter(service: HomeContentService, auth?: AuthOptions): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/articles', async (_req, res) => res.json({ data: await service.listArticles() }));
  router.get('/articles/:id', async (req, res) =>
    res.json({ data: await service.article(req.params.id) })
  );
  router.get('/weekly-teams/:id', async (req, res) =>
    res.json({ data: await service.weeklyTeam(req.params.id) })
  );
  if (auth) {
    router.use('/admin', requireAuth(auth, 'admin'));
    router.get('/admin/articles', async (_req, res) =>
      res.json({ data: await service.listArticles(true) })
    );
    router.get('/admin/weekly-teams/:id', async (req, res) =>
      res.json({ data: await service.weeklyTeam(req.params.id, true) })
    );
    router.use('/admin', requireTrustedOrigin(auth.frontendOrigin));
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
