import { expect, test } from 'vitest';
import { calculateChampionStats } from './champion-stats.js';

test('Counts maps rather than players or series and keeps unavailable bans null', () => {
  const rows = calculateChampionStats([
    { gameId: '1', champion: 'Ahri', teamId: 'a', winnerTeamId: 'a' },
    { gameId: '1', champion: ' ahri ', teamId: 'a', winnerTeamId: 'a' },
    { gameId: '1', champion: 'Garen', teamId: 'b', winnerTeamId: 'a' },
    { gameId: '2', champion: 'Ahri', teamId: 'a', winnerTeamId: 'b' },
    { gameId: '3', champion: 'Ashe', teamId: 'a', winnerTeamId: null }
  ]);
  expect(rows).toEqual([
    {
      champion: 'Ahri',
      games: 2,
      wins: 1,
      losses: 1,
      totalGames: 2,
      pickRate: 100,
      winRate: 50,
      banRate: null
    },
    {
      champion: 'Garen',
      games: 1,
      wins: 0,
      losses: 1,
      totalGames: 2,
      pickRate: 50,
      winRate: 0,
      banRate: null
    }
  ]);
});

test('No imported results produce no rows or invented percentages', () => {
  expect(calculateChampionStats([])).toEqual([]);
  expect(
    calculateChampionStats([{ gameId: '1', champion: '', teamId: 'a', winnerTeamId: 'a' }])
  ).toEqual([]);
});
