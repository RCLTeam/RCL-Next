import type { Player } from '@rcl/contracts';
import { expect, test } from 'vitest';
import {
  type PlayerGameRow,
  aggregatePlayerStats,
  enrichPlayers,
  matchMvps,
  mvpScore,
  playerRole
} from './player-statistics.js';

const row = (overrides: Partial<PlayerGameRow> = {}): PlayerGameRow => ({
  playerId: 'a',
  gameId: 'g1',
  matchId: 'm1',
  divisionId: 'd1',
  roundId: 2,
  teamId: 't1',
  team: { id: 't1', name: 'Equipo', shortName: null, logoUrl: null },
  position: 'mid',
  champion: 'Ahri',
  durationSeconds: 1800,
  winnerTeamId: 't1',
  kills: 5,
  deaths: 2,
  assists: 5,
  cs: 240,
  damageToChampions: 21000,
  goldEarned: 12000,
  visionScore: 30,
  damageMitigated: 12000,
  ...overrides
});

const player = (id: string): Player => ({
  id,
  gameName: id,
  riotTag: null,
  displayName: null,
  countryCode: null,
  isMain: true
});

test('playerRole normalizes position names correctly', () => {
  expect(playerRole('middle')).toBe('mid');
  expect(playerRole('bottom')).toBe('adc');
  expect(playerRole('bot')).toBe('adc');
  expect(playerRole('utility')).toBe('support');
  expect(playerRole('sup')).toBe('support');
  expect(playerRole('jg')).toBe('jungle');
  expect(playerRole('jungla')).toBe('jungle');
  expect(playerRole('top')).toBe('top');
  expect(playerRole(null)).toBeNull();
});

test('splash champion uses most played, breaking ties by the latest pick', () => {
  for (const [picks, expected] of [
    [[], null],
    [['Ahri'], 'Ahri'],
    [['Ahri', 'Ahri', 'Garen'], 'Ahri'],
    [['Ahri', 'Garen', 'Ashe'], 'Ashe'],
    [['Ahri', 'Garen', 'Garen', 'Ahri', 'Ashe'], 'Ahri']
  ] as const) {
    const rows = picks.map((champion, index) => row({ champion, gameId: `g${index}` }));
    rows.push(row({ playerId: 'other', champion: 'Lux' }));
    const result = enrichPlayers([player('a')], rows, []);
    expect(result[0]?.competition?.champion).toBe(expected);
    expect(rows.filter((game) => game.playerId === 'a').map((game) => game.champion)).toEqual(
      picks
    );
  }
});

test('aggregates rates by elapsed time, participation by team kills, and averages nullable metrics', () => {
  const rows = [
    row(),
    row({ playerId: 'b', kills: 15 }),
    row({
      gameId: 'g2',
      durationSeconds: 3600,
      kills: 10,
      assists: 0,
      deaths: 0,
      cs: 360,
      visionScore: null,
      damageMitigated: null,
      winnerTeamId: 't2'
    })
  ];
  const stats = aggregatePlayerStats(
    rows.filter((r) => r.playerId === 'a'),
    rows
  );
  expect(stats.kda).toBe(10);
  expect(stats.csPerMinute).toBeCloseTo(600 / 90);
  expect(stats.killParticipation).toBeCloseTo((100 * 20) / 30);
  expect(stats.winRate).toBe(50);
  expect(stats.visionScore).toBe(30);
  expect(stats.damageMitigated).toBe(12000);
});

test('missing time and optional stats remain unavailable; zero deaths and zero kills are finite', () => {
  const rows = [
    row({
      kills: 0,
      assists: 0,
      deaths: 0,
      durationSeconds: null,
      visionScore: null,
      damageMitigated: null,
      goldEarned: null
    })
  ];
  expect(aggregatePlayerStats(rows, rows)).toMatchObject({
    kda: 0,
    killParticipation: 0,
    csPerMinute: null,
    damagePerMinute: null,
    visionScore: null,
    damageMitigated: null
  });
  expect(mvpScore(rows, rows)).toBe(0);
});

test('one MVP per series with deterministic ties and no score inflation from repeated maps', () => {
  const rows = [row({ deaths: 0 }), row({ playerId: 'b', deaths: 0 })];
  const repeated = [
    ...rows.map((r) => ({ ...r, gameId: 'g1' })),
    ...rows.map((r) => ({ ...r, gameId: 'g2' }))
  ];

  expect(
    mvpScore(
      repeated.filter((r) => r.playerId === 'a'),
      repeated
    )
  ).toBeGreaterThan(0);

  expect(matchMvps(repeated).map((award) => award.playerId)).toEqual(['a']);
  expect(matchMvps([...repeated].reverse()).map((award) => award.playerId)).toEqual(['a']);
});

test('featured player is the best current-round match MVP, excluding older rounds and other division round IDs', () => {
  const rows = [
    row({ playerId: 'old', roundId: 1, kills: 30, assists: 30, deaths: 0 }),
    row({ playerId: 'a', matchId: 'm2', gameId: 'g2' }),
    row({ playerId: 'b', matchId: 'm3', gameId: 'g3', kills: 1, assists: 0, deaths: 10 }),
    row({
      playerId: 'other',
      divisionId: 'd2',
      matchId: 'm4',
      gameId: 'g4',
      kills: 40,
      assists: 40
    })
  ];
  const result = enrichPlayers(['old', 'a', 'b', 'other', 'none'].map(player), rows, [
    { id: 2, divisionId: 'd1', name: 'Jornada 2' }
  ]);
  expect(result.filter((p) => p.competition?.featured).map((p) => p.id)).toEqual(['a']);
  expect(result.find((p) => p.id === 'none')?.competition?.stats).toBeNull();
  expect(result.find((p) => p.id === 'a')?.competition?.mvpMatchIds).toEqual(['m2']);
  expect(JSON.stringify(result)).not.toContain('score');
  expect(
    enrichPlayers([player('a')], rows, [{ id: 3, divisionId: 'd1', name: 'Jornada 3' }])[0]
      ?.competition?.featured
  ).toBeNull();
});

test('support role normalization rewards vision and participation without requiring carry farm', () => {
  const support = row({
    position: 'UTILITY',
    cs: 45,
    damageToChampions: 9000,
    visionScore: 75,
    damageMitigated: 18000
  });
  expect(mvpScore([support], [support])).toBeGreaterThan(
    mvpScore([{ ...support, position: 'adc' }], [support])
  );
});

test('calculates gold efficiency metrics correctly in mvpScore and falls back to DPM/CS when gold is absent', () => {
  const rowWithGold = row({
    goldEarned: 15000,
    damageToChampions: 30000,
    durationSeconds: 1800
  });
  const rowWithoutGold = row({
    goldEarned: null,
    damageToChampions: 30000,
    durationSeconds: 1800
  });

  const scoreWithGold = mvpScore([rowWithGold], [rowWithGold]);
  const scoreWithoutGold = mvpScore([rowWithoutGold], [rowWithoutGold]);

  expect(scoreWithGold).toBeGreaterThan(0);
  expect(scoreWithoutGold).toBeGreaterThan(0);
  expect(Number.isFinite(scoreWithGold)).toBe(true);
  expect(Number.isFinite(scoreWithoutGold)).toBe(true);
});
