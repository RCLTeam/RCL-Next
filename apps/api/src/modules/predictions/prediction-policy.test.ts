import { expect, test } from 'vitest';
import { leagueWeek, predictionPoints, predictionWindow } from './prediction-policy.js';

test('weeks start Monday midnight in Madrid including DST', () => {
  for (const [before, monday, week] of [
    ['2026-09-27T21:59:59Z', '2026-09-27T22:00:00Z', '2026-09-28'],
    ['2026-10-25T22:59:59Z', '2026-10-25T23:00:00Z', '2026-10-26'],
    ['2026-03-29T21:59:59Z', '2026-03-29T22:00:00Z', '2026-03-30']
  ] as const) {
    expect(leagueWeek(new Date(before)).week).not.toBe(week);
    expect(leagueWeek(new Date(monday)).week).toBe(week);
  }
});

test('voting stays open after Tuesday and closes exactly one hour before each match', () => {
  const match = new Date('2026-10-02T18:00:00Z');
  for (const now of ['2026-09-30T00:00:00Z', '2026-10-02T16:59:59.999Z']) {
    expect(predictionWindow(match, 'scheduled', new Date(now))).toEqual({
      open: true,
      closed: false
    });
  }
  for (const now of ['2026-10-02T17:00:00Z', '2026-10-02T18:00:00Z']) {
    expect(predictionWindow(match, 'scheduled', new Date(now))).toEqual({
      open: false,
      closed: true
    });
  }
  expect(
    predictionWindow(
      new Date('2026-10-02T20:00:00Z'),
      'scheduled',
      new Date('2026-10-02T17:00:00Z')
    ).open
  ).toBe(true);
});

test('only scheduled matches in this week accept predictions', () => {
  const now = new Date('2026-09-28T10:00:00Z');
  for (const date of [null, new Date('2026-10-09T18:00:00Z'), new Date('2026-09-28T09:00:00Z')])
    expect(predictionWindow(date, 'scheduled', now).open).toBe(false);
  for (const status of ['live', 'completed', 'forfeit', 'cancelled'])
    expect(predictionWindow(new Date('2026-10-02T18:00:00Z'), status, now).open).toBe(false);
});

test('cutoff is one elapsed hour across daylight saving transitions', () => {
  for (const scheduledAt of ['2026-03-29T01:30:00Z', '2026-10-25T01:30:00Z']) {
    const match = new Date(scheduledAt);
    expect(predictionWindow(match, 'scheduled', new Date(match.getTime() - 3600001)).open).toBe(
      true
    );
    expect(predictionWindow(match, 'scheduled', new Date(match.getTime() - 3600000)).closed).toBe(
      true
    );
  }
});

test('exact score awards three total points, winner only one, no streak bonus', () => {
  expect(predictionPoints(true, true)).toBe(3);
  expect(predictionPoints(true, false)).toBe(1);
  expect(predictionPoints(false, false)).toBe(0);
});
