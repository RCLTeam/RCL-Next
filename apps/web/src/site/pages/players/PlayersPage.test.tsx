import type { PlayerStatistics } from '@rcl/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { FeaturedPlayer, PlayerGrid, filterPlayers, playerSortOptions } from './PlayersPage.js';
const stats: PlayerStatistics = {
  games: 1,
  kda: 3,
  csPerMinute: 8,
  killParticipation: 60,
  winRate: 50,
  damagePerMinute: 700,
  visionScore: 30,
  damageMitigated: 20000
};
const player = {
  id: 'a',
  slug: 'jugador-a',
  gameName: 'Jugador A',
  riotTag: null,
  countryCode: null,
  displayName: null,
  isMain: true,
  competition: {
    role: 'mid',
    team: null,
    champion: 'Ahri',
    stats,
    mvpMatchIds: ['m1'],
    featured: { roundName: 'Jornada 2', stats }
  }
};
test('every requested statistic sorts numerically descending, missing stats last, and combines role and search', () => {
  const other = {
    ...player,
    id: 'b',
    gameName: 'Jugador B',
    competition: {
      ...player.competition,
      role: 'support',
      stats: { ...stats, ...Object.fromEntries(playerSortOptions.map(([key]) => [key, 100000])) }
    }
  };
  const missing = { ...player, id: 'c', competition: { ...player.competition, stats: null } };
  for (const [sort] of playerSortOptions)
    expect(
      filterPlayers([missing, player, other], 'jugador', 'all', sort).map((p) => p.id)
    ).toEqual(['b', 'a', 'c']);
  expect(filterPlayers([player, other], 'jugador', 'support').map((p) => p.id)).toEqual(['b']);
  expect(playerSortOptions).toHaveLength(7);
});
test('featured stats and selected card metric render without internal MVP scores', () => {
  const html = renderToStaticMarkup(<FeaturedPlayer player={player} />);
  expect(html).toContain('MVP de la jornada');
  expect(html).toContain('Jornada 2');
  expect(html).toContain('/jugadores/jugador-a');
  expect(html).not.toContain('score');
  const grid = renderToStaticMarkup(<PlayerGrid players={[player]} sort="damagePerMinute" />);
  expect(grid).toContain('Daño a campeones/min');
  expect(grid).toContain('700');
  expect(renderToStaticMarkup(<FeaturedPlayer player={undefined} />)).toContain('se anunciará');
});
