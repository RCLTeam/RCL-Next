import { Router } from 'express';
import { z } from 'zod';
import { type AuthOptions, requireAuth, requireTrustedOrigin } from '../auth/auth.router.js';
import type { PredictionsRepository } from './predictions.repository.js';

export function predictionsRouter(repository: PredictionsRepository, auth?: AuthOptions): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/divisions/:id', async (req, res) => {
    res.json({ data: await repository.overview(z.string().uuid().parse(req.params.id)) });
  });
  if (auth) {
    router.get('/divisions/:id/mine', requireAuth(auth), async (req, res) => {
      res.json({
        data: await repository.mine(
          z.string().uuid().parse(req.params.id),
          String(res.locals.user.discordId)
        )
      });
    });
    router.put(
      '/matches/:id',
      requireAuth(auth),
      requireTrustedOrigin(auth.frontendOrigin),
      async (req, res) => {
        const pick = z
          .object({
            selectedTeamId: z.string().uuid(),
            homeScore: z.number().int().min(0).max(100).nullable(),
            awayScore: z.number().int().min(0).max(100).nullable()
          })
          .strict()
          .parse(req.body);
        await repository.save(String(res.locals.user.discordId), {
          ...pick,
          matchId: z.string().uuid().parse(req.params.id)
        });
        res.json({ data: null });
      }
    );
  }
  return router;
}
