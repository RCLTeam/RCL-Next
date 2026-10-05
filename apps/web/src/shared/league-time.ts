import { LEAGUE_TIME_ZONE } from '@rcl/contracts';

// Shown next to match times so visitors abroad know which clock they follow.
export const LEAGUE_TIME_LABEL = 'Hora peninsular española';

const formatters = new Map<string, Intl.DateTimeFormat>();

// Formats an instant in the league's time zone so every visitor sees the same date and time.
export function formatLeagueDate(
  value: string | Date,
  options: Omit<Intl.DateTimeFormatOptions, 'timeZone'>
): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('es-ES', { ...options, timeZone: LEAGUE_TIME_ZONE });
    formatters.set(key, formatter);
  }
  return formatter.format(date);
}
