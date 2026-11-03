import { expect, test } from 'vitest';
import type {
  Match,
  Standing,
  Team
} from '../../../features/competition/types/competition.types.js';
import { buildPlayoff, outcome } from './playoff-model.js';

const teams: Team[] = Array.from({ length: 6 }, (_, i) => ({
  id: `${i + 1}`,
  name: `Equipo ${i + 1}`,
  shortName: null,
  discordRoleId: '0',
  logoUrl: null
}));
const standings: Standing[] = teams.map((team, i) => ({
  team,
  position: i + 1,
  played: 10,
  wins: 10 - i,
  losses: i,
  mapsWon: 20,
  mapsLost: i,
  mapDifference: 20 - i
}));
function game(
  id: string,
  round: number,
  home: number,
  away: number,
  status: Match['status'] = 'completed'
): Match {
  const homeTeam = teams[home - 1];
  const awayTeam = teams[away - 1];
  if (!homeTeam || !awayTeam) throw new Error('Invalid test team');
  return {
    id,
    homeTeam,
    awayTeam,
    homeScore: 3,
    awayScore: 1,
    status,
    bestOf: 5,
    scheduledAt: null,
    streamUrl: null,
    streamUrlLive: null,
    round: { id: `${round}`, sequence: round, stage: 'playoff', name: null }
  };
}

test('fills all eight slots from published matches, including reversed home/away and upper rematches', () => {
  const games = [
    game('a', 10, 1, 4),
    game('b', 10, 2, 3),
    game('u', 11, 1, 2),
    game('c', 11, 4, 5),
    game('d', 11, 3, 6),
    game('l', 12, 4, 3),
    game('lf', 13, 2, 4),
    game('f', 14, 2, 1)
  ];
  const bracket = buildPlayoff([...games].reverse(), standings);
  for (const [slot, entry] of Object.entries(bracket)) expect(entry.match?.id).toBe(slot);
  expect(bracket.c.teams[0]?.id).toBe('4');
  expect(outcome(bracket.f.match, true)?.id).toBe('2');
});

test('advances confirmed winners without inventing the leader choice or lower assignments', () => {
  const empty = buildPlayoff([], standings);
  expect(empty.a.teams.map((team) => team?.id)).toEqual(['1', undefined]);
  expect(empty.c.teams.map((team) => team?.id)).toEqual(['5', undefined]);
  const bracket = buildPlayoff([game('a', 10, 1, 4), game('b', 10, 2, 3)], standings);
  expect(bracket.u.teams.map((team) => team?.id)).toEqual(['1', '2']);
  expect(bracket.c.teams[1]).toBeUndefined();
});

test('live, cancelled, scheduled and tied matches never advance teams', () => {
  for (const status of ['live', 'cancelled', 'scheduled'] as const)
    expect(outcome(game('a', 10, 1, 4, status), true)).toBeUndefined();
  expect(outcome({ ...game('a', 10, 1, 4), awayScore: 3 }, true)).toBeUndefined();
  expect(outcome({ ...game('a', 10, 1, 4, 'forfeit'), winnerTeamId: '1' }, false)?.id).toBe('4');
});

test.each(['1', '4'])(
  'forfeit at 0-0 advances declared winner %s and assigns the loser',
  (winnerTeamId) => {
    const match = { ...game('a', 10, 1, 4, 'forfeit'), homeScore: 0, awayScore: 0, winnerTeamId };
    const loserId = winnerTeamId === '1' ? '4' : '1';
    expect(outcome(match, true)?.id).toBe(winnerTeamId);
    expect(outcome(match, false)?.id).toBe(loserId);
    const lower = game('c', 11, 5, Number(loserId), 'scheduled');
    const bracket = buildPlayoff([match, game('b', 10, 2, 3), lower], standings);
    expect(bracket.u.teams[0]?.id).toBe(winnerTeamId);
    expect(bracket.c.match?.id).toBe('c');
  }
);

test('declared winner takes precedence over scores and invalid forfeits do not advance', () => {
  const match = game('a', 10, 1, 4, 'forfeit');
  expect(outcome({ ...match, winnerTeamId: '4' }, true)?.id).toBe('4');
  for (const winnerTeamId of [null, 'unknown']) {
    expect(outcome({ ...match, winnerTeamId }, true)).toBeUndefined();
    expect(outcome({ ...match, winnerTeamId }, false)).toBeUndefined();
  }
  expect(outcome(match, true)).toBeUndefined();
  expect(outcome({ ...match, status: 'live', winnerTeamId: '1' }, true)).toBeUndefined();
});

test('cancelled matches do not displace republished opening or later matches', () => {
  const bracket = buildPlayoff(
    [
      game('0-old-round', 9, 1, 4, 'cancelled'),
      game('0-old-opening', 10, 1, 4, 'cancelled'),
      game('a', 10, 1, 4),
      game('b', 10, 2, 3),
      game('0-old-upper', 11, 1, 2, 'cancelled'),
      game('u', 11, 1, 2)
    ],
    standings
  );
  expect(bracket.a.match?.id).toBe('a');
  expect(bracket.b.match?.id).toBe('b');
  expect(bracket.u.match?.id).toBe('u');
  expect(
    buildPlayoff([game('cancelled', 10, 1, 4, 'cancelled')], standings).a.match
  ).toBeUndefined();
});

test('ignores regular season matches and keeps scheduled playoff scores attached', () => {
  const regular = game('regular', 1, 1, 2);
  if (regular.round) regular.round.stage = 'regular';
  const bracket = buildPlayoff(
    [regular, game('a', 10, 1, 4, 'scheduled'), game('b', 10, 2, 3, 'scheduled')],
    standings
  );
  expect(bracket.a.match?.id).toBe('a');
  expect(bracket.u.teams).toEqual([undefined, undefined]);
});

test.each(['-10', '-11', null, undefined])(
  'excludes inactive seed %s and renumbers active qualifiers',
  (discordRoleId) => {
    const firstRow = standings[0];
    if (!firstRow) throw new Error('Missing fixture');
    const inactive = {
      ...firstRow,
      position: 1,
      team: { ...firstRow.team, id: 'inactive', discordRoleId: discordRoleId ?? null }
    };
    if (discordRoleId === undefined) Reflect.deleteProperty(inactive.team, 'discordRoleId');
    const rows = [inactive, ...standings.map((row) => ({ ...row, position: row.position + 1 }))];
    const snapshot = JSON.stringify(rows);
    const bracket = buildPlayoff([], rows);
    expect(bracket.a.teams[0]?.id).toBe('1');
    expect(bracket.c.teams[0]?.id).toBe('5');
    expect(bracket.d.teams[0]?.id).toBe('6');
    expect(JSON.stringify(rows)).toBe(snapshot);
  }
);

test('ignores published games involving inactive teams, including stale calendar activity', () => {
  const row = standings[0];
  if (!row) throw new Error('Missing fixture');
  const inactive = {
    ...row,
    position: 0,
    team: { ...row.team, id: 'inactive', discordRoleId: '-10' }
  };
  const staleTeam = { ...inactive.team, discordRoleId: '0' };
  const games = [
    { ...game('old-home', 9, 1, 4), homeTeam: staleTeam },
    { ...game('old-away', 9, 1, 4), awayTeam: staleTeam },
    game('a', 10, 1, 4),
    game('b', 10, 2, 3)
  ];
  const bracket = buildPlayoff(games, [inactive, ...standings]);
  expect(bracket.a.match?.id).toBe('a');
  expect(bracket.b.match?.id).toBe('b');
  expect(
    buildPlayoff([{ ...game('old', 9, 1, 4), homeTeam: inactive.team }], []).a.match
  ).toBeUndefined();
});
