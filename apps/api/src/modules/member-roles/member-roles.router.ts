import { Router } from 'express';
import { type AuthOptions, requireAuth, requireTrustedOrigin } from '../auth/auth.router.js';
import type { MemberRolesService } from './member-roles.service.js';

export function memberRolesRouter(service: MemberRolesService, auth: AuthOptions): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/', requireAuth(auth, 'admin'), async (req, res) =>
    res.json({ data: await service.list(req.query) })
  );
  router.patch(
    '/:discordId',
    requireTrustedOrigin(auth.frontendOrigin),
    requireAuth(auth, 'owner'),
    async (req, res) => {
      const data = await service.changeRole(
        String(res.locals.user.discordId),
        req.params.discordId,
        req.body
      );
      res.json({ data });
    }
  );
  return router;
}
