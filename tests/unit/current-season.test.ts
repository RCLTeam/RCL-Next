import { expect, test } from 'vitest';
import {
  currentSeason,
  sortSeasons
} from '../../apps/web/src/features/competition/hooks/useCompetitionSelection.js';

const past = { id: 'past', name: 'Past', startsOn: '2025-01-01', endsOn: '2025-12-31' };
const active = { id: 'active', name: 'Active', startsOn: '2026-01-01', endsOn: '2026-12-31' };
const future = { id: 'future', name: 'Future', startsOn: '2027-01-01', endsOn: '2027-12-31' };

test('selects the current season even when a future season is listed first', () => {
  expect(currentSeason([future, past, active], '2026-09-27')).toBe(active);
});

test('does not fall back to finished or future seasons', () => {
  expect(currentSeason([future, past], '2026-09-27')).toBeUndefined();
  expect(currentSeason([], '2026-09-27')).toBeUndefined();
});

test('includes the last day and allows seasons without an end date', () => {
  expect(currentSeason([active], '2026-12-31')).toBe(active);
  const open = { ...past, endsOn: null };
  expect(currentSeason([active, open], '2026-09-27')).toBe(open);
});

test('orders open seasons first, then newest start dates, without mutating the input', () => {
  const open = { ...past, id: 'open', endsOn: null };
  const undated = { id: 'undated', name: 'Undated', startsOn: null, endsOn: null };
  const input = [past, active, undated, future, open];
  expect(sortSeasons(input)).toEqual([open, undated, future, active, past]);
  expect(input).toEqual([past, active, undated, future, open]);
});
