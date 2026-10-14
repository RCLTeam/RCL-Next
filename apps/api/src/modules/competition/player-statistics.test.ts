import type { Player } from '@rcl/contracts';
import { expect, test } from 'vitest';
import {
  type PlayerGameRow,
  aggregatePlayerStats,
  compareMvpRanking,
  enrichPlayers,
  mapMvpScore,
  matchMvpScore,
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

test('repeating an identical map does not inflate the series score', () => {
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
  ).toBe(mvpScore([row({ deaths: 0 })], rows));

  expect(matchMvps(repeated).map((award) => award.playerId)).toEqual(['a']);
  expect(matchMvps([...repeated].reverse()).map((award) => award.playerId)).toEqual(['a']);
});

test('role swaps use each map role and duration independently of input order', () => {
  const mid = row();
  const support = row({
    gameId: 'g2',
    position: 'support',
    durationSeconds: 3600,
    cs: 50,
    damageToChampions: 12000,
    visionScore: 120
  });
  const rows = [mid, support];
  const expected = (mapMvpScore(mid, rows) + 2 * mapMvpScore(support, rows)) / 3;
  expect(matchMvpScore(rows, rows)).toBeCloseTo(expected, 10);
  expect(matchMvpScore([...rows].reverse(), rows)).toBeCloseTo(expected, 10);
  expect(mvpScore(rows, rows)).toBe(Math.round(expected * 10) / 10);
  expect(mapMvpScore(support, rows)).toBeGreaterThan(
    mapMvpScore({ ...support, position: 'mid' }, rows)
  );
});

test('invalid durations do not dilute valid maps or produce non-finite scores', () => {
  const valid = row();
  const invalid = [null, 0, -1].map((durationSeconds, i) =>
    row({ durationSeconds, gameId: `invalid-${i}`, kills: 100 })
  );
  expect(matchMvpScore(invalid, invalid)).toBe(0);
  expect(matchMvpScore([valid, ...invalid], [valid, ...invalid])).toBe(mapMvpScore(valid, [valid]));
});

test.each([1, 2, 3, 5])('eligibility requires at least half of %i maps', (mapCount) => {
  const minimum = Math.ceil(mapCount / 2);
  for (const played of [minimum - 1, minimum]) {
    const rows = Array.from({ length: mapCount }, (_, index) => [
      row({ gameId: `g${index}`, playerId: 'starter', kills: 1, deaths: 20 }),
      ...(index < played
        ? [row({ gameId: `g${index}`, playerId: 'sub', kills: 20, deaths: 0 })]
        : [])
    ]).flat();
    expect(matchMvps(rows)[0]?.playerId).toBe(played >= minimum ? 'sub' : 'starter');
  }
});

test('a losing-team star cannot win the series MVP; tied series allow both teams', () => {
  const rows = ['g1', 'g2'].flatMap((gameId) => [
    row({ gameId, playerId: 'winner', kills: 1, deaths: 20 }),
    row({ gameId, playerId: 'star', teamId: 't2', kills: 30, deaths: 0 })
  ]);
  expect(matchMvps(rows)[0]?.playerId).toBe('winner');
  const tied = rows.map((r) => ({ ...r, winnerTeamId: r.gameId === 'g2' ? 't2' : 't1' }));
  expect(matchMvps(tied)[0]?.playerId).toBe('star');
});

test('ranking retains precision when displayed scores are equal', () => {
  const first = row();
  const second = row({ playerId: 'z', damageToChampions: 21001 });
  const rows = [first, second];
  expect(mvpScore([first], rows)).toBe(mvpScore([second], rows));
  expect(matchMvps(rows)[0]?.playerId).toBe('z');
  expect(matchMvps([...rows].reverse())[0]?.playerId).toBe('z');
});

test('a consistent player can win a series without winning an individual map', () => {
  const rows = ['g1', 'g2'].flatMap((gameId) => [
    row({ gameId, playerId: 'consistent', kills: 12, assists: 0 }),
    row({ gameId, playerId: 'peak1', kills: gameId === 'g1' ? 20 : 0, assists: 0 }),
    row({ gameId, playerId: 'peak2', kills: gameId === 'g2' ? 20 : 0, assists: 0 })
  ]);
  expect(matchMvps(rows.filter((r) => r.gameId === 'g1'))[0]?.playerId).toBe('peak1');
  expect(matchMvps(rows.filter((r) => r.gameId === 'g2'))[0]?.playerId).toBe('peak2');
  expect(matchMvps(rows)[0]?.playerId).toBe('consistent');
});

test('no award is issued for empty data, unfinished maps or unavailable durations', () => {
  expect(matchMvps([])).toEqual([]);
  expect(matchMvps([row({ winnerTeamId: null })])).toEqual([]);
  expect(matchMvps([row({ durationSeconds: null })])).toEqual([]);
});

test('equal exact scores prefer more map wins before player identifiers', () => {
  const rows = [
    row({ playerId: 'a', kills: 0, assists: 0 }),
    row({ playerId: 'z', kills: 0, assists: 0 }),
    row({ playerId: 'z', gameId: 'g2', kills: 0, assists: 0 })
  ];
  expect(
    matchMvpScore(
      rows.filter((r) => r.playerId === 'a'),
      rows
    )
  ).toBe(
    matchMvpScore(
      rows.filter((r) => r.playerId === 'z'),
      rows
    )
  );
  expect(matchMvps(rows)[0]?.playerId).toBe('z');
});

test('each series is evaluated independently', () => {
  const first = row();
  const second = row({ matchId: 'm2', gameId: 'g2', playerId: 'b', kills: 30 });
  expect(matchMvps([first, second])).toEqual([...matchMvps([first]), ...matchMvps([second])]);
});

test('enrichment consumes persisted awards and the selected banner without recalculating them', () => {
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
  const result = enrichPlayers(
    ['old', 'a', 'b', 'other', 'none'].map(player),
    rows,
    [{ matchId: 'm2', playerId: 'a' }],
    { roundId: 2, divisionId: 'd1', roundName: 'Jornada 2', playerId: 'a' }
  );
  expect(result.filter((p) => p.competition?.featured).map((p) => p.id)).toEqual(['a']);
  expect(result.find((p) => p.id === 'none')?.competition?.stats).toBeNull();
  expect(result.find((p) => p.id === 'a')?.competition?.mvpMatchIds).toEqual(['m2']);
  expect(JSON.stringify(result)).not.toContain('score');
  expect(enrichPlayers([player('a')], rows, [])[0]?.competition?.featured).toBeNull();
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

test('MVP score calculation with goldEarned picks higher gold/impact player in matchMvps', () => {
  const durationSeconds = 1800;

  const buzel = row({
    playerId: 'Buzel',
    gameId: 'g1',
    matchId: 'm1',
    position: 'mid',
    champion: 'Viktor',
    durationSeconds,
    kills: 10,
    deaths: 1,
    assists: 5,
    cs: 275,
    damageToChampions: 32000,
    goldEarned: 14000,
    visionScore: 35,
    damageMitigated: 10000
  });

  const smoky = row({
    playerId: 'Sm0kY',
    gameId: 'g1',
    matchId: 'm1',
    position: 'adc',
    champion: 'Jinx',
    durationSeconds,
    kills: 10,
    deaths: 2,
    assists: 8,
    cs: 275,
    damageToChampions: 28350,
    goldEarned: 14500,
    visionScore: 30,
    damageMitigated: 12150
  });

  const top = row({
    playerId: 'top',
    gameId: 'g1',
    matchId: 'm1',
    position: 'top',
    champion: 'Gnar',
    durationSeconds,
    kills: 6,
    deaths: 2,
    assists: 5,
    cs: 200,
    damageToChampions: 15000,
    goldEarned: 11000,
    visionScore: 20,
    damageMitigated: 20000
  });

  const all = [buzel, smoky, top];

  const buzelScore = mvpScore([buzel], all);
  const smokyScore = mvpScore([smoky], all);

  expect(buzelScore).toBe(108.7);
  expect(smokyScore).toBe(107.1);
  expect(buzelScore).toBeGreaterThan(smokyScore);

  const awards = matchMvps(all);
  expect(awards).toHaveLength(1);
  expect(awards[0]?.playerId).toBe('Buzel');
  expect(awards[0]?.score).toBe(108.7);
});

test.each(['score', 'wins', 'killParticipation', 'kda', 'damageToChampions'] as const)(
  'shared ranking breaks ties by %s before all subsequent criteria',
  (key) => {
    const keys = ['score', 'wins', 'killParticipation', 'kda', 'damageToChampions'] as const;
    const a = {
      playerId: 'a',
      score: 100,
      wins: 2,
      killParticipation: 50,
      kda: 3,
      damageToChampions: 1000
    };
    const z = { ...a, playerId: 'z', [key]: a[key] + 1 };
    for (const later of keys.slice(keys.indexOf(key) + 1)) a[later] += 100;
    expect(compareMvpRanking(z, a)).toBeLessThan(0);
    expect(compareMvpRanking(a, z)).toBeGreaterThan(0);
  }
);

test('shared ranking uses player ID only after every sporting criterion ties', () => {
  const a = {
    playerId: 'a',
    score: 100,
    wins: 2,
    killParticipation: 50,
    kda: 3,
    damageToChampions: 1000
  };
  expect(compareMvpRanking(a, { ...a, playerId: 'z' })).toBeLessThan(0);
  expect(compareMvpRanking(a, a)).toBe(0);
});

test('series scoring visits team-kill data linearly across many maps', () => {
  let gameReads = 0;
  const count = 80;
  const rows = Array.from({ length: count }, (_, index) => ({
    ...row(),
    get gameId() {
      gameReads += 1;
      return `g${index}`;
    }
  }));
  const opponents = rows.map((_, index) =>
    row({ playerId: 'opponent', teamId: 't2', gameId: `g${index}` })
  );
  gameReads = 0;
  expect(matchMvpScore(rows, [...rows, ...opponents])).toBeCloseTo(mapMvpScore(row(), [row()]), 10);
  expect(gameReads).toBeLessThan(count * 10);
});
