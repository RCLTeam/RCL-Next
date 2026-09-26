import type { AuthUser, CreateSuggestionResponse } from '@rcl/contracts';
import { type NextFunction, type Request, type Response, Router } from 'express';
import { AppError, notFound } from '../../shared/app-error.js';
import type { AuthOptions } from '../auth/auth.router.js';
import type { SuggestionsService } from './suggestions.service.js';

export interface SuggestionsRouterOptions {
  suggestionsService?: SuggestionsService | undefined;
  service?: SuggestionsService | undefined;
  frontendOrigin?: string | undefined;
  auth?: AuthOptions | undefined;
}

function extractSessionCookie(req: Request, secureCookies: boolean): string | undefined {
  const name = secureCookies ? '__Host-rcl_session' : 'rcl_session';
  const entries = (req.headers.cookie ?? '').split(';').map((part) => part.trim());
  const matches = entries.filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
}

export function createSuggestionsRouter(
  optionsOrService: SuggestionsRouterOptions | SuggestionsService,
  maybeAuthOptions?: AuthOptions
): Router {
  const router = Router();

  let service: SuggestionsService;
  let frontendOrigin: string | undefined;
  let authOptions: AuthOptions | undefined;

  if (
    'getStatus' in optionsOrService &&
    ('submit' in optionsOrService || 'submitSuggestion' in optionsOrService)
  ) {
    service = optionsOrService as SuggestionsService;
    authOptions = maybeAuthOptions;
    frontendOrigin = maybeAuthOptions?.frontendOrigin;
  } else {
    const opts = optionsOrService as SuggestionsRouterOptions;
    const resolvedService = opts.suggestionsService ?? opts.service;
    if (!resolvedService) {
      throw new Error('SuggestionsRouter requires suggestionsService or service option');
    }
    service = resolvedService;
    authOptions = opts.auth;
    frontendOrigin = opts.frontendOrigin ?? opts.auth?.frontendOrigin;
  }

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
        const token = extractSessionCookie(req, authOptions.secureCookies);
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
        user
      );

      res.status(202).json({
        id: result.id,
        status: result.status
      });
    } catch (err) {
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

export const suggestionsRouter = createSuggestionsRouter;
