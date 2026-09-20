import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { App } from '../../../apps/web/src/App.js';
import { siteRoutes } from '../../../apps/web/src/shared/navigation.js';

test('App blocks replay upload until the session has been verified', () => {
  const html = renderToString(React.createElement(App, { initialPath: '/admin/rofl/upload' }));
  assert.match(html, /Comprobando acceso/);
  assert.doesNotMatch(html, /Dropzone for ROFL and ZIP files/i);
});

test('App renders 404 view on unknown route', () => {
  const html = renderToString(React.createElement(App, { initialPath: '/unknown/route' }));
  assert.match(html, /404 — Not Found/i);
});

test('Home links to public pages without exposing administration', () => {
  const html = renderToString(React.createElement(App, { initialPath: '/' }));
  for (const route of siteRoutes) {
    assert.match(html, new RegExp(`href="${route.path}"`));
  }
  assert.doesNotMatch(html, /href="\/admin"/);
  assert.match(html, /Cuenta de Discord/);
  assert.match(html, /LA CORONA/);
  assert.doesNotMatch(html, /Dropzone for ROFL and ZIP files/);
});

test('Each public route renders only its own page, including direct links and trailing slashes', () => {
  for (const route of siteRoutes) {
    for (const path of new Set([route.path, `${route.path.replace(/\/$/, '')}/`])) {
      const html = renderToString(React.createElement(App, { initialPath: path }));
      assert.match(html, new RegExp(`id="${route.id}"`));
      assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
      assert.ok(
        (html.match(/<a\b[^>]*>/g) ?? []).some(
          (tag) => tag.includes(`href="${route.path}"`) && tag.includes('aria-current="page"')
        )
      );
      for (const other of siteRoutes.filter((item) => item.id !== route.id)) {
        assert.doesNotMatch(html, new RegExp(`id="${other.id}"`));
      }
      assert.doesNotMatch(html, /404 — Not Found/);
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
    assert.ok(navigation);
    assert.doesNotMatch(navigation, /href="\/admin"/);
    assert.match(html, /id="admin"/);
    assert.match(html, /Comprobando acceso/);
    assert.doesNotMatch(html, /Dropzone for ROFL and ZIP files/);
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
    assert.doesNotMatch(html, /404 — Not Found/);
  }
});
