// Calendar weeks use league time, including DST.
export function leagueWeek(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
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
