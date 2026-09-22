import { Router, raw } from 'express';
import { type AuthOptions, requireAuth, requireTrustedOrigin } from '../auth/auth.router.js';
import {
  type DatabaseTransferService,
  MAX_DATABASE_BACKUP_BYTES
} from './database-transfer.service.js';

export function databaseTransferRouter(
  service: DatabaseTransferService,
  auth: AuthOptions
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth(auth, 'admin'), requireTrustedOrigin(auth.frontendOrigin));
  router.post('/export', async (_req, res) => {
    const backup = await service.exportDatabase(String(res.locals.user.discordId));
    res
      .type('application/octet-stream')
      .attachment(`rcl-${new Date().toISOString().replaceAll(':', '-')}.dump`)
      .send(backup);
  });
  router.use(requireAuth(auth, 'owner'));
  router.use(
    raw({ type: 'application/octet-stream', limit: MAX_DATABASE_BACKUP_BYTES, inflate: false })
  );
  router.post('/import-preview', async (req, res) =>
    res.json({ data: await service.previewImport(req.body, String(res.locals.user.discordId)) })
  );
  router.post('/import', async (req, res) =>
    res.json({
      data: await service.importDatabase(
        req.body,
        req.get('X-Import-Confirmation'),
        String(res.locals.user.discordId)
      )
    })
  );
  return router;
}
