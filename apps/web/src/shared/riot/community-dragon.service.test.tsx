import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { GameIcon } from './GameIcon.js';
import { getPositionAsset } from './community-dragon.service.js';

afterEach(() => vi.unstubAllGlobals());

test.each([
  ['TOP', 'top'],
  ['JUNGLE', 'jungle'],
  ['MID', 'middle'],
  ['MIDDLE', 'middle'],
  ['ADC', 'bottom'],
  ['BOT', 'bottom'],
  ['BOTTOM', 'bottom'],
  ['SUPPORT', 'utility'],
  ['SUP', 'utility'],
  ['UTILITY', 'utility'],
  [' mid ', 'middle']
])('Resolves position %s to the Community Dragon file %s', (position, file) => {
  expect(getPositionAsset(position).image).toBe(
    `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${file}.png`
  );
});

test.each([null, '', 'SIN POSICIÓN', 'unknown', '../top'])(
  'Unknown position %s has no fabricated URL',
  (position) => {
    expect(getPositionAsset(position)).toEqual({ name: 'Sin posición' });
  }
);

test('Position icons work before the Data Dragon catalog has loaded', () => {
  const html = renderToStaticMarkup(<GameIcon kind="position" id="ADC" catalog={{}} />);
  expect(html).toContain('icon-position-bottom.png');
  expect(html).toContain('alt="ADC"');
});

test('Missing positions render accessible text instead of a broken image', () => {
  const html = renderToStaticMarkup(<GameIcon kind="position" id={null} catalog={{}} />);
  expect(html).not.toContain('<img');
  expect(html).toContain('Sin posición');
});

test('Community Dragon assets survive a Data Dragon outage', async () => {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
  const { loadGameCatalog } = await import('./riot-assets.service.js');
  const catalog = await loadGameCatalog();
  expect(catalog['position:MID']?.image).toContain('icon-position-middle.png');
  expect(catalog['rune:5001']).toBeDefined();
});
