import { expect, test } from 'vitest';
import { leagueWeek, predictionPoints, predictionWindow } from './prediction-policy.js';

test('Madrid voting opens Monday midnight and closes after Tuesday 23:59 including DST', () => {
  for (const [before, open, end, closed] of [
    [
      '2026-09-27T21:59:59Z',
      '2026-09-27T22:00:00Z',
      '2026-09-29T21:59:59Z',
      '2026-09-29T22:00:00Z'
    ],
    [
      '2026-10-25T22:59:59Z',
      '2026-10-25T23:00:00Z',
      '2026-10-27T22:59:59Z',
      '2026-10-27T23:00:00Z'
    ],
    ['2026-03-29T21:59:59Z', '2026-03-29T22:00:00Z', '2026-03-31T21:59:59Z', '2026-03-31T22:00:00Z']
  ] as const) {
    expect(leagueWeek(new Date(before)).open).toBe(false);
    expect(leagueWeek(new Date(open)).open).toBe(true);
    expect(leagueWeek(new Date(end)).open).toBe(true);
    expect(leagueWeek(new Date(closed)).open).toBe(false);
  }
});
test('only future scheduled matches in this week accept predictions', () => {
  const now = new Date('2026-09-28T10:00:00Z');
  expect(predictionWindow(new Date('2026-10-02T18:00:00Z'), 'scheduled', now).open).toBe(true);
  for (const date of [null, new Date('2026-10-09T18:00:00Z'), new Date('2026-09-28T09:00:00Z')])
    expect(predictionWindow(date, 'scheduled', now).open).toBe(false);
  expect(predictionWindow(new Date('2026-10-02T18:00:00Z'), 'live', now).open).toBe(false);
  expect(
    predictionWindow(
      new Date('2026-10-02T18:00:00Z'),
      'scheduled',
      new Date('2026-09-30T00:00:00Z')
    ).closed
  ).toBe(true);
});
test('exact score awards three total points, winner only one, no streak bonus', () => {
  expect(predictionPoints(true, true)).toBe(3);
  expect(predictionPoints(true, false)).toBe(1);
  expect(predictionPoints(false, false)).toBe(0);
});
