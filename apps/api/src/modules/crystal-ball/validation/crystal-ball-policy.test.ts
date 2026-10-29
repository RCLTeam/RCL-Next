import { expect, test } from 'vitest';
import { crystalQuestions } from '../processing/crystal-ball-questions.js';
import { type CrystalStat, automaticResults } from '../processing/crystal-ball-results.js';
import {
  crystalPoints,
  durationBucket,
  goldBucket,
  pentakillBucket,
  validateAnswers
} from './crystal-ball-policy.js';

test('brackets require four and two distinct eligible teams; ordinary answers cannot select multiple winners', () => {
  const questions = crystalQuestions(
    [{ id: 'd', name: 'Premier' }],
    Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: String(i), divisionId: 'd' })),
    [{ id: 'p', name: 'Player' }]
  );
  expect(() =>
    validateAnswers({ 'winner:d': ['0', '1', '2', '3'], 'loser:d': ['4', '5'] }, questions)
  ).not.toThrow();
  for (const answers of [
    { 'winner:d': ['0', '1', '2'] },
    { 'winner:d': ['0', '1', '2', '2'] },
    { 'winner:d': ['0', '1', '2', '3'], 'loser:d': ['3', '5'] },
    { 'champion:d': ['0', '1'] },
    { 'player-mvp': ['foreign'] },
    { unknown: ['x'] }
  ])
    expect(() => validateAnswers(answers, questions)).toThrow();
  expect(() => validateAnswers({ 'champion:d': ['0', '1'] }, questions, true)).not.toThrow();
  expect(
    crystalPoints(
      { 'winner:d': ['0', '1', '2', '3'], 'champion:d': ['0'] },
      { 'winner:d': ['0', '1', '2', '4'], 'champion:d': ['0', '1'] }
    )
  ).toBe(4);
});

test('duration boundaries use five minute intervals without gaps', () => {
  expect([1199, 1200, 1499, 1500, 2699, 2700, 5000].map(durationBucket)).toEqual([
    '0',
    '1',
    '1',
    '2',
    '5',
    '6',
    '6'
  ]);
});

test('statistics accept ties, require three champion appearances for winrate, and leave missing telemetry unresolved', () => {
  const games = [0, 1, 2].map((i) => ({
    id: String(i),
    winnerTeamId: 'blue',
    durationSeconds: 1400 + i
  }));
  const stats: CrystalStat[] = games.flatMap((game) =>
    Array.from({ length: 10 }, (_, i) => ({
      gameId: game.id,
      playerId: `p${i}`,
      teamId: i < 5 ? 'blue' : 'red',
      champion: `champion${i}`,
      position: `role${i % 5}`,
      kills: i,
      deaths: i,
      assists: 10 - i,
      pentaKills: 0,
      goldEarned: i < 5 ? 10000 : 9000
    }))
  );
  const result = automaticResults(games, stats, ['p0', 'p0', 'p1']);
  expect(result['player-mvp']).toEqual(['p0']);
  expect(result['player-kills']).toEqual(['p9']);
  expect(result['player-assists']).toEqual(['p0']);
  expect(result['champion-best-winrate']).toHaveLength(5);
  expect(result['champion-worst-winrate']).toHaveLength(5);
  expect(result['gold-difference']).toEqual(['gold-1']);
  expect(result.pentakills).toEqual(['0']);
  expect(result['shortest-game']).toEqual(['1']);
  expect(
    automaticResults(
      games.slice(0, 1),
      stats.filter((s) => s.gameId === '0')
    )['champion-best-winrate']
  ).toBeUndefined();
  const incomplete = automaticResults(
    games,
    stats.map((s) => ({ ...s, pentaKills: null, goldEarned: null, position: null, isMvp: false }))
  );
  expect(incomplete.pentakills).toBeUndefined();
  expect(incomplete['gold-difference']).toBeUndefined();
  expect(incomplete['player-mvp']).toBeUndefined();
  expect(incomplete['champion-positions']).toBeUndefined();
  expect(automaticResults(games, stats.slice(1))).toEqual({});
});

test('numeric choices cover boundaries and reject arbitrary answers', () => {
  expect([0, 4999, 5000, 9999, 10000, 14999, 15000, 19999, 20000, 99999].map(goldBucket)).toEqual([
    'gold-0',
    'gold-0',
    'gold-1',
    'gold-1',
    'gold-2',
    'gold-2',
    'gold-3',
    'gold-3',
    'gold-4',
    'gold-4'
  ]);
  expect([0, 1, 2, 3, 4, 5, 6, 99].map(pentakillBucket)).toEqual([
    '0',
    '1',
    '2',
    '3',
    '4',
    '5+',
    '5+',
    '5+'
  ]);
  const questions = crystalQuestions([], [], []);
  expect(() =>
    validateAnswers({ 'gold-difference': ['gold-1'], pentakills: ['5+'] }, questions)
  ).not.toThrow();
  expect(() => validateAnswers({ 'gold-difference': ['5000'] }, questions)).toThrow();
  expect(() => validateAnswers({ pentakills: ['6'] }, questions)).toThrow();
  expect(
    crystalPoints(
      { 'gold-difference': ['6500'], pentakills: ['7'] },
      { 'gold-difference': ['gold-1'], pentakills: ['5+'] }
    )
  ).toBe(2);
});

test('series MVPs accept ties and do not depend on obsolete map flags or map imports', () => {
  expect(automaticResults([], [], ['a', 'b', 'a', 'b'])['player-mvp']).toEqual(['a', 'b']);
  expect(automaticResults([], [], ['a', null])['player-mvp']).toBeUndefined();
});
