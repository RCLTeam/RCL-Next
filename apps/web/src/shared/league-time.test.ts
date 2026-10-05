import { afterAll, beforeAll, expect, test } from 'vitest';
import { formatLeagueDate } from './league-time.js';

const processTimeZone = process.env.TZ;
// Run as a visitor outside the league's time zone.
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (processTimeZone === undefined) Reflect.deleteProperty(process.env, 'TZ');
  else process.env.TZ = processTimeZone;
});

test('formats instants in Madrid time regardless of the process time zone', () => {
  // 22:30 UTC on 4 October is 00:30 on 5 October in Madrid (CEST) and 18:30 in New York.
  const value = '2026-10-04T22:30:00Z';
  expect(new Date(value).getHours()).toBe(18);
  expect(formatLeagueDate(value, { hour: '2-digit', minute: '2-digit' })).toBe('00:30');
  expect(formatLeagueDate(value, { day: 'numeric', month: 'long', year: 'numeric' })).toBe(
    '5 de octubre de 2026'
  );
});

test('follows daylight saving time in Madrid', () => {
  expect(formatLeagueDate('2026-01-15T23:15:00Z', { hour: '2-digit', minute: '2-digit' })).toBe(
    '00:15'
  );
});

test('returns null for invalid dates', () => {
  expect(formatLeagueDate('not-a-date', { hour: '2-digit' })).toBeNull();
});
