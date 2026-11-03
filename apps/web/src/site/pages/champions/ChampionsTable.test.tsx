import type { ChampionStats } from '@rcl/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ChampionsTable, filterChampionStats } from './ChampionsTable.js';

const rows: ChampionStats[] = [
  {
    champion: 'Ahri',
    games: 2,
    wins: 1,
    losses: 1,
    totalGames: 4,
    pickRate: 50,
    winRate: 50
  },
  {
    champion: 'MonkeyKing',
    games: 1,
    wins: 1,
    losses: 0,
    totalGames: 4,
    pickRate: 25,
    winRate: 100
  }
];
const catalog = {
  'champion:MonkeyKing': { name: 'Wukong', image: 'https://example.com/Wukong.png' }
};

test('Champion search uses the localized catalog name and ranking does not mutate API data', () => {
  expect(filterChampionStats(rows, catalog, ' wuk ', 'games').map((row) => row.champion)).toEqual([
    'MonkeyKing'
  ]);
  expect(filterChampionStats(rows, catalog, '', 'winRate')[0]?.champion).toBe('MonkeyKing');
  expect(rows[0]?.champion).toBe('Ahri');
  expect(filterChampionStats(rows, catalog, 'missing', 'games')).toEqual([]);
});

test('Champion search ignores internal identifiers that are not displayed', () => {
  expect(filterChampionStats(rows, catalog, 'monkey', 'games')).toEqual([]);
});

test('Equal win rates rank by games played before the champion name', () => {
  const tied: ChampionStats[] = [
    { ...(rows[1] as ChampionStats), champion: 'Aatrox', games: 1, wins: 1 },
    { ...(rows[1] as ChampionStats), champion: 'Zed', games: 5, wins: 5 },
    { ...(rows[1] as ChampionStats), champion: 'Ahri', games: 1, wins: 1 }
  ];
  expect(filterChampionStats(tied, {}, '', 'winRate').map((row) => row.champion)).toEqual([
    'Zed',
    'Aatrox',
    'Ahri'
  ]);
});

test('Renders recorded statistics and provider icons without a bans column', () => {
  const html = renderToStaticMarkup(<ChampionsTable rows={rows} catalog={catalog} />);
  expect(html).toContain('Wukong.png');
  expect(html).toContain('50 %');
  expect(html).toContain('4 mapas analizados');
  expect(html).toContain('Pick %');
  expect(html).toContain('Win %');
  expect(html).not.toContain('Ban %');
  expect(html).not.toContain('aria-describedby="champion-stats-note"');
  expect(html).toContain('tabindex="0"');
});

test('Empty statistics span all seven table columns', () => {
  const html = renderToStaticMarkup(<ChampionsTable />);
  expect(html).toContain('colSpan="7"');
  expect(html).toContain('Las estadisticas de campeones todavia no estan disponibles.');
});
