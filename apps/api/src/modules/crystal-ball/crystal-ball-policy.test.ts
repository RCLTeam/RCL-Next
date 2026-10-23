import { expect, test } from 'vitest';
import { crystalPoints, durationBucket, validateAnswers } from './crystal-ball-policy.js';
import { crystalQuestions } from './crystal-ball-questions.js';
import { type CrystalStat, automaticResults } from './crystal-ball-results.js';

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
      isMvp: i === 0,
      pentaKills: 0,
      goldEarned: i < 5 ? 10000 : 9000
    }))
  );
  const result = automaticResults(games, stats);
  expect(result['player-mvp']).toEqual(['p0']);
  expect(result['player-kills']).toEqual(['p9']);
  expect(result['player-assists']).toEqual(['p0']);
  expect(result['champion-best-winrate']).toHaveLength(5);
  expect(result['champion-worst-winrate']).toHaveLength(5);
  expect(result['gold-difference']).toEqual(['5000']);
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
