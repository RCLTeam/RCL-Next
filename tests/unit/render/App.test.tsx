import React from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from '../../../apps/web/src/App.js';
import { siteRoutes } from '../../../apps/web/src/site/routes.js';

test('Team detail direct links render their own page and keep Teams selected', () => {
  for (const path of [
    '/equipos/30000000-0000-4000-8000-000000000001',
    '/equipos/lobos',
    '/equipos/lobos/',
    '/equipos/30000000-0000-4000-8000-000000000001/'
  ]) {
    const html = renderToString(React.createElement(App, { initialPath: path }));
    expect(html).toMatch(/id="equipo"/);
    expect(html).toMatch(/Cargando equipo/);
    expect(html).not.toMatch(/404 — Not Found/);
    expect(
      (html.match(/<a\b[^>]*>/g) ?? []).some(
        (tag) => tag.includes('href="/equipos"') && tag.includes('aria-current="page"')
      )
    ).toBeTruthy();
  }
});

test('App blocks replay upload until the session has been verified', () => {
  const html = renderToString(React.createElement(App, { initialPath: '/admin/rofl/upload' }));
  expect(html).toMatch(/Comprobando acceso/);
  expect(html).not.toMatch(/Dropzone for ROFL and ZIP files/i);
});

test('App renders 404 view on unknown route', () => {
  const html = renderToString(React.createElement(App, { initialPath: '/unknown/route' }));
  expect(html).toMatch(/404 — Not Found/i);
});

test('Home links to public pages without exposing administration', () => {
  const html = renderToString(React.createElement(App, { initialPath: '/' }));
  for (const route of siteRoutes) {
    expect(html).toMatch(new RegExp(`href="${route.path}"`));
  }
  expect(html).not.toMatch(/href="\/admin"/);
  expect(html).toMatch(/Cuenta de Discord/);
  expect(html).toMatch(/LA CORONA/);
  expect(html).not.toMatch(/Dropzone for ROFL and ZIP files/);
});

test('Each public route renders only its own page, including direct links and trailing slashes', () => {
  for (const route of siteRoutes) {
    for (const path of new Set([route.path, `${route.path.replace(/\/$/, '')}/`])) {
      const html = renderToString(React.createElement(App, { initialPath: path }));
      expect(html).toMatch(new RegExp(`id="${route.id}"`));
      expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
      expect(
        (html.match(/<a\b[^>]*>/g) ?? []).some(
          (tag) => tag.includes(`href="${route.path}"`) && tag.includes('aria-current="page"')
        )
      ).toBeTruthy();
      for (const other of siteRoutes.filter((item) => item.id !== route.id)) {
        expect(html).not.toMatch(new RegExp(`id="${other.id}"`));
      }
      expect(html).not.toMatch(/404 — Not Found/);
    }
  }
});

test('Both admin URLs and their trailing slash aliases are guarded and absent from public navigation', () => {
  for (const path of [
    '/admin',
    '/admin/',
    '/admin/rofl/upload',
    '/admin/rofl/upload/',
    '/admin/crud',
    '/admin/crud/'
  ]) {
    const html = renderToString(React.createElement(App, { initialPath: path }));
    const navigation = html.match(/<nav\b[^>]*id="site-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    expect(navigation).toBeTruthy();
    expect(navigation).not.toMatch(/href="\/admin"/);
    expect(html).toMatch(/id="admin"/);
    expect(html).toMatch(/Comprobando acceso/);
    expect(html).not.toMatch(/Dropzone for ROFL and ZIP files/);
    expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
    expect(html).not.toMatch(/404 — Not Found/);
  }
});
