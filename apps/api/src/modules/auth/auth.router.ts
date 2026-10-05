import type { AuthUser } from '@rcl/contracts';
import { type CookieOptions, type RequestHandler, Router } from 'express';
import { AppError } from '../../shared/app-error.js';
import { type AuthService, SESSION_LIFETIME_MS, STATE_LIFETIME_MS } from './auth.service.js';
import { readCookie, readSessionCookie, sessionCookieName } from './session-cookie.js';

export interface AuthOptions {
  service: AuthService;
  secureCookies: boolean;
  frontendOrigin: string;
}

export function requireAuth(options: AuthOptions, role?: AuthUser['role']): RequestHandler {
  return async (req, res, next) => {
    const user = await options.service.currentUser(
      readSessionCookie(req.headers.cookie, options.secureCookies)
    );
    if (role && user.role !== role && !(role === 'admin' && user.role === 'owner'))
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
  const sessionCookie = sessionCookieName(options.secureCookies);
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
    const login = await options.service.start(readCookie(req.headers.cookie, stateCookie));
    res.cookie(stateCookie, login.state, { ...cookieOptions, maxAge: STATE_LIFETIME_MS });
    res.redirect(login.url);
  });
  router.get('/discord/callback', async (req, res) => {
    const state = readCookie(req.headers.cookie, stateCookie);
    res.clearCookie(stateCookie, cookieOptions);
    await options.service.validateState(req.query.state, state);
    if (req.query.error === 'access_denied') {
      res.redirect(options.frontendOrigin);
      return;
    }
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
    const token = await options.service.login(
      req.query.code,
      readSessionCookie(req.headers.cookie, options.secureCookies)
    );
    res.cookie(sessionCookie, token, { ...cookieOptions, maxAge: SESSION_LIFETIME_MS });
    // Fixed destination from validated configuration; never accept a query redirect.
    res.redirect(options.frontendOrigin);
  });
  router.get('/me', requireAuth(options), (_req, res) => res.json({ data: res.locals.user }));
  router.post('/logout', requireTrustedOrigin(options.frontendOrigin), async (req, res) => {
    await options.service.logout(readSessionCookie(req.headers.cookie, options.secureCookies));
    res.clearCookie(sessionCookie, cookieOptions);
    res.status(204).end();
  });
  return router;
}
