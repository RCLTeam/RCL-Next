import { expect, test } from 'vitest';
import { predictionsOverviewPath } from './usePredictions.js';

test('the overview path only carries the round when one is selected', () => {
  expect(predictionsOverviewPath('d')).toBe('divisions/d');
  expect(predictionsOverviewPath('d', '')).toBe('divisions/d');
  expect(predictionsOverviewPath('d', '5')).toBe('divisions/d?roundId=5');
});
