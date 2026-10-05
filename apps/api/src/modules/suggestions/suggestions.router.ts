import type { AuthUser, CreateSuggestionResponse } from '@rcl/contracts';
import { type NextFunction, type Request, type Response, Router } from 'express';
import { AppError, notFound } from '../../shared/app-error.js';
import type { AuthOptions } from '../auth/auth.router.js';
import { readSessionCookie } from '../auth/session-cookie.js';
import type { SuggestionsService } from './suggestions.service.js';

export interface SuggestionsRouterOptions {
  suggestionsService: SuggestionsService;
  /** Only origin allowed to submit; defaults to `auth.frontendOrigin`. */
  frontendOrigin?: string | undefined;
  auth?: AuthOptions | undefined;
}

export function createSuggestionsRouter(options: SuggestionsRouterOptions): Router {
  const router = Router();
  const service = options.suggestionsService;
  const authOptions = options.auth;
  const frontendOrigin = options.frontendOrigin ?? authOptions?.frontendOrigin;

  // Ensure Cache-Control: no-store on all suggestions endpoints
  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // POST /api/v1/suggestions
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (frontendOrigin) {
        const originHeader = req.get('Origin');
        if (!originHeader || originHeader !== frontendOrigin) {
          throw new AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
        }
      }

      const rawSuggestion = req.body?.suggestion;
      if (typeof rawSuggestion !== 'string') {
        throw new AppError(400, 'VALIDATION_ERROR', 'Suggestion text is required.');
      }

      const trimmed = rawSuggestion.trim();
      if (trimmed.length < 10 || trimmed.length > 1000) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Suggestion text must be between 10 and 1000 characters.'
        );
      }

      // Resolve optional authenticated user
      let user: AuthUser | undefined =
        res.locals.user ?? (req as unknown as { user?: AuthUser }).user ?? undefined;

      if (!user && authOptions?.service) {
        const token = readSessionCookie(req.headers.cookie, authOptions.secureCookies);
        if (token) {
          try {
            user = (await authOptions.service.currentUser(token)) ?? undefined;
          } catch {
            user = undefined;
          }
        }
      }

      const isAnonymous = Boolean(req.body?.isAnonymous);
      const result: CreateSuggestionResponse = await service.submit(
        {
          suggestion: trimmed,
          isAnonymous
        },
        user,
        // req.ip honours the application's `trust proxy` setting (TRUST_PROXY).
        { clientIp: req.ip }
      );

      res.status(202).json({
        id: result.id,
        status: result.status
      });
    } catch (err) {
      if (err instanceof AppError && err.code === 'RATE_LIMITED') {
        const retryAfter = (err.details as { retryAfterSeconds?: unknown } | undefined)
          ?.retryAfterSeconds;
        if (typeof retryAfter === 'number') {
          res.set('Retry-After', String(retryAfter));
        }
      }
      next(err);
    }
  });

  // GET /api/v1/suggestions/status/:id
  router.get('/status/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      if (!id || typeof id !== 'string') {
        throw notFound('Suggestion');
      }

      const status = service.getStatus(id);
      if (!status) {
        throw notFound('Suggestion');
      }

      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
