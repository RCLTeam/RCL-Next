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

  for (const [sort] of playerSortOptions.filter(([key]) => key !== 'mvps'))
    expect(
      filterPlayers([missing, player, other], 'jugador', 'all', sort).map((p) => p.id)
    ).toEqual(['b', 'a', 'c']);

  expect(filterPlayers([player, other, subPlayer], 'jugador', 'support').map((p) => p.id)).toEqual([
    'b'
  ]);

  expect(
    filterPlayers([player, other, subPlayer], 'jugador', 'substitute').map((p) => p.id)
  ).toEqual(['sub']);

  expect(playerSortOptions).toHaveLength(8);
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
  expect(grid).toContain('Daño/min');
  expect(grid).not.toContain('Daño a campeones por minuto.');
  expect(grid).toContain('700');
  expect(renderToStaticMarkup(<FeaturedPlayer player={undefined} />)).toContain(
    'Todavía no hay un MVP de jornada disponible en esta división.'
  );
});

test('historical awards remain visible in the directory without statistics or a roster role', () => {
  const historical = {
    ...player,
    competition: { ...player.competition, role: null, stats: null, champion: null, featured: null }
  };
  expect(filterPlayers([historical], '').map((p) => p.id)).toEqual([player.id]);
  const html = renderToStaticMarkup(<PlayerGrid players={[historical]} />);
  expect(html).not.toContain('<dt>MVPs</dt>');
  expect(renderToStaticMarkup(<PlayerGrid players={[historical]} sort="mvps" />)).toContain(
    '<dt>MVPs</dt><dd>1</dd>'
  );
  expect(html).toContain('<dt>KDA</dt><dd>—</dd>');
  expect(html).not.toContain('Estadísticas pendientes.');
  expect(
    filterPlayers(
      [{ ...historical, competition: { ...historical.competition, mvpMatchIds: [] } }],
      ''
    )
  ).toEqual([]);
});

test('noncompetitive affiliations are excluded without results and never become role filters', () => {
  const affiliations = ['coach', 'staff', 'partners'].map((role) => ({
    ...player,
    id: role,
    competition: {
      ...player.competition,
      role,
      stats: null,
      mvpMatchIds: [],
      featured: null
    }
  }));
  const substitute = {
    ...player,
    id: 'substitute',
    competition: {
      ...player.competition,
      role: 'substitute',
      stats: null,
      mvpMatchIds: [],
      featured: null
    }
  };
  expect(filterPlayers([...affiliations, substitute], '').map((p) => p.id)).toEqual(['substitute']);
  for (const role of ['coach', 'staff', 'partners', 'unknown']) {
    expect(filterPlayers(affiliations, '', role)).toEqual([]);
  }
  const historical = affiliations.map((p) => ({
    ...p,
    competition: { ...p.competition, mvpMatchIds: ['historical'] }
  }));
  expect(filterPlayers(historical, '')).toHaveLength(3);
  expect(filterPlayers(historical, '', 'mid')).toEqual([]);
  expect(filterPlayers(historical, 'no match')).toEqual([]);
});

test('banner renders the awarded round supplied by the API even without current statistics', () => {
  const html = renderToStaticMarkup(
    <FeaturedPlayer
      player={{
        ...player,
        competition: {
          ...player.competition,
          stats: null,
          featured: { roundName: 'Jornada 1', stats }
        }
      }}
    />
  );
  expect(html).toContain('Jornada 1');
  expect(html).toContain('Jugador A');
  expect(html).not.toContain('jornada actual');
  expect(html).not.toContain('Todavía no hay');
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
  for (const [sort] of playerSortOptions.filter(([key]) => key !== 'mvps')) {
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

test('featured player shows one valid team logo with or without a champion', () => {
  for (const champion of ['Ahri', null]) {
    for (const logoUrl of ['/images/team.png', 'javascript:invalid', null]) {
      const html = renderToStaticMarkup(
        <FeaturedPlayer
          player={{
            ...player,
            competition: {
              ...player.competition,
              champion,
              team: { id: 'team', name: 'Team', shortName: null, logoUrl }
            }
          }}
        />
      );
      expect((html.match(/class="team-badge/g) ?? []).length).toBe(
        logoUrl === '/images/team.png' ? 1 : 0
      );
    }
  }
});

test('MVP sorting uses persisted awards without stats and renders the count once', () => {
  const winner = {
    ...player,
    id: 'winner',
    competition: { ...player.competition, stats: null, mvpMatchIds: ['m1', 'm2'] }
  };
  const none = { ...player, id: 'none', competition: { ...player.competition, mvpMatchIds: [] } };
  expect(filterPlayers([none, player, winner], '', 'all', 'mvps').map((p) => p.id)).toEqual([
    'winner',
    'a',
    'none'
  ]);
  const html = renderToStaticMarkup(<PlayerGrid players={[winner]} sort="mvps" />);
  expect(html.match(/<dt>MVPs<\/dt>/g)).toHaveLength(1);
  expect(html).toContain('<dd>2</dd>');
});
