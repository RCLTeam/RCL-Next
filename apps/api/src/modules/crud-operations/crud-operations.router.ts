import { Router } from 'express';
import { type AuthOptions, requireAuth, requireTrustedOrigin } from '../auth/auth.router.js';
import type { CrudOperationsService } from './crud-operations.service.js';

export function crudOperationsRouter(service: CrudOperationsService, auth: AuthOptions): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(auth, 'admin'));
  router.get('/resources', (_req, res) => res.json({ data: service.resources() }));
  router.get('/references/:resource', async (req, res) =>
    res.json({ data: await service.list(String(req.params.resource), req.query, true) })
  );
  router.get('/:resource', async (req, res) =>
    res.json({ data: await service.list(String(req.params.resource), req.query) })
  );
  router.use(requireTrustedOrigin(auth.frontendOrigin));
  router.post('/:resource/delete-preview', requireAuth(auth, 'owner'), async (req, res) => {
    res.json({
      data: await service.previewDelete(
        String(req.params.resource),
        req.body,
        String(res.locals.user.discordId)
      )
    });
  });
  for (const [method, action] of [
    ['post', 'create'],
    ['put', 'update'],
    ['delete', 'delete']
  ] as const) {
    router[method]('/:resource', async (req, res) => {
      const data = await service.mutate(
        String(req.params.resource),
        action,
        req.body,
        String(res.locals.user.discordId)
      );
      if (action === 'delete') res.status(204).end();
      else res.status(action === 'create' ? 201 : 200).json({ data });
    });
  }
  return router;
}
