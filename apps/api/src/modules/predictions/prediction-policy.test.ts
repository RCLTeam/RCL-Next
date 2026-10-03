import { expect, test } from 'vitest';
import {
  currentRoundId,
  leagueWeek,
  predictionPoints,
  predictionWindow
} from './prediction-policy.js';

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

test('current round is the latest one whose Madrid week has started, including break weeks', () => {
  const rounds = [
    { id: 4, startsAt: new Date('2026-09-06T22:00:00Z') },
    { id: 5, startsAt: new Date('2026-09-27T22:00:00Z') },
    { id: 6, startsAt: new Date('2026-10-04T22:00:00Z') },
    { id: 7, startsAt: null }
  ];
  for (const [now, expected] of [
    ['2026-10-03T10:00:00Z', 5],
    ['2026-10-04T21:59:59.999Z', 5],
    ['2026-10-04T22:00:00Z', 6],
    ['2026-09-16T10:00:00Z', 4],
    ['2026-09-01T10:00:00Z', null]
  ] as const)
    expect(currentRoundId(rounds, new Date(now))).toBe(expected);
  expect(currentRoundId([], new Date('2026-10-03T10:00:00Z'))).toBeNull();
});

test('a round starting midweek is current from that Monday; ties keep the higher id', () => {
  const midweek = new Date('2026-09-30T16:00:00Z');
  expect(currentRoundId([{ id: 5, startsAt: midweek }], new Date('2026-09-28T08:00:00Z'))).toBe(5);
  expect(
    currentRoundId(
      [
        { id: 3, startsAt: midweek },
        { id: 2, startsAt: midweek }
      ],
      new Date('2026-10-01T08:00:00Z')
    )
  ).toBe(3);
});

test('current round switches at Monday midnight in Madrid across the DST change', () => {
  const rounds = [
    { id: 8, startsAt: new Date('2026-10-18T22:00:00Z') },
    { id: 9, startsAt: new Date('2026-10-25T23:00:00Z') }
  ];
  expect(currentRoundId(rounds, new Date('2026-10-25T22:59:59Z'))).toBe(8);
  expect(currentRoundId(rounds, new Date('2026-10-25T23:00:00Z'))).toBe(9);
});
