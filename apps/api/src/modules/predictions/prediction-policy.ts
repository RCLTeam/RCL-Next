import { LEAGUE_TIME_ZONE } from '@rcl/contracts';

// Calendar weeks use league time, including DST.
export function leagueWeek(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LEAGUE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
  const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  return { week: day.toISOString().slice(0, 10) };
}

// The current round is the latest one whose league week has already started.
export function currentRoundId(
  rounds: readonly { id: number; startsAt: Date | null }[],
  now: Date
): number | null {
  const week = leagueWeek(now).week;
  let current: { id: number; startsAt: Date } | null = null;
  for (const { id, startsAt } of rounds) {
    if (!startsAt || leagueWeek(startsAt).week > week) continue;
    const time = startsAt.getTime();
    const currentTime = current?.startsAt.getTime() ?? Number.NEGATIVE_INFINITY;
    if (!current || time > currentTime || (time === currentTime && id > current.id))
      current = { id, startsAt };
  }
  return current?.id ?? null;
}

export function predictionWindow(scheduledAt: Date | null, status: string, now: Date) {
  const current = leagueWeek(now);
  const week = scheduledAt ? leagueWeek(scheduledAt).week : null;
  const closed =
    scheduledAt !== null &&
    (now.getTime() >= scheduledAt.getTime() - 60 * 60 * 1000 || status !== 'scheduled');
  return {
    open: week === current.week && status === 'scheduled' && scheduledAt !== null && !closed,
    closed
  };
}

export function predictionPoints(correctWinner: boolean, exactScore: boolean) {
  return correctWinner ? (exactScore ? 3 : 1) : 0;
}
