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

  const subPlayer = {
    ...player,
    id: 'sub',
    gameName: 'Jugador Suplente',
    isMain: false,
    competition: {
      ...player.competition,
      role: 'substitute'
    }
  };

  const missing = { ...player, id: 'c', competition: { ...player.competition, stats: null } };

  for (const [sort] of playerSortOptions)
    expect(
      filterPlayers([missing, player, other], 'jugador', 'all', sort).map((p) => p.id)
    ).toEqual(['b', 'a', 'c']);

  expect(filterPlayers([player, other, subPlayer], 'jugador', 'support').map((p) => p.id)).toEqual([
    'b'
  ]);

  expect(
    filterPlayers([player, other, subPlayer], 'jugador', 'substitute').map((p) => p.id)
  ).toEqual(['sub']);

  expect(playerSortOptions).toHaveLength(7);
});

test('includes free agent / active-role-less players with stats in "all" view', () => {
  const inactiveWithStats = {
    ...player,
    id: 'free-agent',
    gameName: 'Jugador Libre',
    competition: {
      ...player.competition,
      role: null,
      stats
    }
  };

  const inactiveWithoutStats = {
    ...player,
    id: 'unregistered',
    gameName: 'Sin Estadisticas',
    competition: {
      ...player.competition,
      role: null,
      stats: null
    }
  };

  const allFiltered = filterPlayers(
    [player, inactiveWithStats, inactiveWithoutStats],
    'jugador',
    'all'
  );
  expect(allFiltered.map((p) => p.id)).toContain('free-agent');
  expect(allFiltered.map((p) => p.id)).not.toContain('unregistered');

  const midFiltered = filterPlayers([player, inactiveWithStats], 'jugador', 'mid');
  expect(midFiltered.map((p) => p.id)).toEqual(['a']);
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

test('players missing the selected statistic sort by team, then name, with no team last', () => {
  const makePlayer = (id: string, gameName: string, teamName: string | null) => ({
    ...player,
    id,
    gameName,
    competition: {
      ...player.competition,
      role: 'top',
      stats: null,
      team: teamName ? { id: teamName, name: teamName, shortName: null, logoUrl: null } : null
    }
  });
  const roster = [
    makePlayer('none', 'A sin equipo', null),
    makePlayer('wolves', 'Ana', 'Lobos'),
    makePlayer('eagles-z', 'Zoe', 'Águilas'),
    makePlayer('eagles-a', 'Álex', 'Águilas')
  ];
  const originalOrder = roster.map((p) => p.id);
  for (const [sort] of playerSortOptions) {
    expect(filterPlayers(roster, '', 'all', sort).map((p) => p.id)).toEqual([
      'eagles-a',
      'eagles-z',
      'wolves',
      'none'
    ]);
  }
  expect(roster.map((p) => p.id)).toEqual(originalOrder);
  const zero = {
    ...player,
    id: 'zero',
    competition: { ...player.competition, stats: { ...stats, kda: 0 } }
  };
  expect(filterPlayers([...roster, zero], '').map((p) => p.id)).toEqual([
    'zero',
    'eagles-a',
    'eagles-z',
    'wolves',
    'none'
  ]);
  const partial = roster.map((p) => ({
    ...p,
    competition: { ...p.competition, stats: { ...stats, visionScore: null } }
  }));
  expect(filterPlayers(partial, '', 'all', 'visionScore').map((p) => p.id)).toEqual([
    'eagles-a',
    'eagles-z',
    'wolves',
    'none'
  ]);
});
