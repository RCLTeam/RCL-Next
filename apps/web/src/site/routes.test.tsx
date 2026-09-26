import { expect, test } from 'vitest';
import { adminRoutes, resolveSiteRoute } from './routes.js';

test('Detail routes retain encoded parameters and their parent navigation', () => {
  for (const [path, navigationPath] of [
    ['/equipos/equipo%20uno/', '/equipos'],
    ['/jugadores/player/', '/jugadores'],
    ['/partidos/match/', '/calendario']
  ] as const) {
    const route = resolveSiteRoute(path);
    expect(route?.navigationPath).toBe(navigationPath);
    expect(route?.competition).toBe(false);
  }
  expect(resolveSiteRoute('/equipos/equipo%20uno')?.parameter).toBe('equipo%20uno');
  expect(resolveSiteRoute('/equipos/one/two')).toBeUndefined();
  expect(resolveSiteRoute('/admin/unknown')).toBeUndefined();
});

test('Routes only request their own data and the visible live-match header', () => {
  expect(resolveSiteRoute('/jugadores')?.competition).toEqual(['calendar']);
  expect(resolveSiteRoute('/equipos')?.competition).toEqual(['calendar', 'teams']);
  expect(resolveSiteRoute('/clasificacion')?.competition).toEqual(['calendar', 'standings']);
  expect(resolveSiteRoute('/calendario')?.competition).toEqual(['calendar', 'rounds']);
  expect(resolveSiteRoute('/campeones')?.competition).toEqual(['calendar']);
  for (const route of adminRoutes) {
    const resolved = resolveSiteRoute(`${route.path}/`);
    expect(resolved?.competition).toBe(false);
    expect(resolved?.navigationPath).toBe('/admin');
    expect(resolved?.title).toContain('Admin');
  }
});
