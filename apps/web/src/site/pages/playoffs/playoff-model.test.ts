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
  expect(outcome(game('a', 10, 1, 4, 'forfeit'), false)?.id).toBe('4');
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
