import { Router } from 'express';
import { z } from 'zod';
import { type AuthOptions, requireAuth, requireTrustedOrigin } from '../auth/auth.router.js';
import type { CrystalBallRepository } from './crystal-ball.repository.js';

const answers = z.record(
  z.string().min(1).max(100),
  z.array(z.string().min(1).max(64)).min(1).max(100)
);
const seasonName = z.string().min(1).max(120);
export function crystalBallRouter(repository: CrystalBallRepository, auth?: AuthOptions): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/:season', async (req, res) => {
    res.json({ data: await repository.overview(seasonName.parse(req.params.season)) });
  });
  if (auth) {
    router.get('/:season/mine', requireAuth(auth), async (req, res) => {
      res.json({
        data: await repository.mine(
          seasonName.parse(req.params.season),
          String(res.locals.user.discordId)
        )
      });
    });
    router.put(
      '/:season/mine',
      requireAuth(auth),
      requireTrustedOrigin(auth.frontendOrigin),
      async (req, res) => {
        await repository.save(
          seasonName.parse(req.params.season),
          String(res.locals.user.discordId),
          answers.parse(req.body)
        );
        res.json({ data: null });
      }
    );
    router.put(
      '/:season/window',
      requireAuth(auth, 'admin'),
      requireTrustedOrigin(auth.frontendOrigin),
      async (req, res) => {
        const body = z
          .object({ opensAt: z.string().datetime(), closesAt: z.string().datetime() })
          .strict()
          .parse(req.body);
        await repository.configure(
          seasonName.parse(req.params.season),
          new Date(body.opensAt),
          new Date(body.closesAt)
        );
        res.json({ data: null });
      }
    );
    router.put(
      '/:season/results',
      requireAuth(auth, 'admin'),
      requireTrustedOrigin(auth.frontendOrigin),
      async (req, res) => {
        const body = z.object({ answers, finalize: z.boolean() }).strict().parse(req.body);
        await repository.resolve(
          seasonName.parse(req.params.season),
          String(res.locals.user.discordId),
          body.answers,
          body.finalize
        );
        res.json({ data: null });
      }
    );
  }
  return router;
}
