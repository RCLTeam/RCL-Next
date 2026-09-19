import type { AuthUser } from '@rcl/contracts';
import { type CookieOptions, type Request, type RequestHandler, Router } from 'express';
import { AppError } from '../../shared/app-error.js';
import { type AuthService, SESSION_LIFETIME_MS, STATE_LIFETIME_MS } from './auth.service.js';

export interface AuthOptions {
  service: AuthService;
  secureCookies: boolean;
  frontendOrigin: string;
}

function cookie(req: Request, name: string): string | undefined {
  const entries = (req.headers.cookie ?? '').split(';').map((part) => part.trim());
  const matches = entries.filter((part) => part.startsWith(`${name}=`));
  // Reject ambiguous cookies; only our fixed-format, opaque tokens are accepted.
  return matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
}

const sessionName = (options: AuthOptions) =>
  options.secureCookies ? '__Host-rcl_session' : 'rcl_session';

export function requireAuth(options: AuthOptions, role?: AuthUser['role']): RequestHandler {
  return async (req, res, next) => {
    const user = await options.service.currentUser(cookie(req, sessionName(options)));
    if (role && user.role !== role)
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions.');
    res.locals.user = user;
    next();
  };
}

// Apply to every future cookie-authenticated mutation as well as logout.
export function requireTrustedOrigin(frontendOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (req.get('Origin') !== frontendOrigin) {
      throw new AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    }
    next();
  };
}

export function authRouter(options: AuthOptions): Router {
  const router = Router();
  const sessionCookie = sessionName(options);
  const stateCookie = options.secureCookies ? '__Host-rcl_oauth_state' : 'rcl_oauth_state';
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: options.secureCookies,
    sameSite: 'lax',
    path: '/'
  };
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  router.get('/discord', async (req, res) => {
    const login = await options.service.start(cookie(req, stateCookie));
    res.cookie(stateCookie, login.state, { ...cookieOptions, maxAge: STATE_LIFETIME_MS });
    res.redirect(login.url);
  });
  router.get('/discord/callback', async (req, res) => {
    const state = cookie(req, stateCookie);
    res.clearCookie(stateCookie, cookieOptions);
    await options.service.validateState(req.query.state, state);
    if (req.query.error !== undefined) {
      throw new AppError(400, 'DISCORD_ACCESS_DENIED', 'Discord authorization was not completed.');
    }
    if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 2048) {
      throw new AppError(
        400,
        'INVALID_OAUTH_CODE',
        'Discord authorization code is missing or invalid.'
      );
    }
    const token = await options.service.login(req.query.code, cookie(req, sessionCookie));
    res.cookie(sessionCookie, token, { ...cookieOptions, maxAge: SESSION_LIFETIME_MS });
    // Fixed destination from validated configuration; never accept a query redirect.
    res.redirect(options.frontendOrigin);
  });
  router.get('/me', requireAuth(options), (_req, res) => res.json({ data: res.locals.user }));
  router.post('/logout', requireTrustedOrigin(options.frontendOrigin), async (req, res) => {
    await options.service.logout(cookie(req, sessionCookie));
    res.clearCookie(sessionCookie, cookieOptions);
    res.status(204).end();
  });
  return router;
}
