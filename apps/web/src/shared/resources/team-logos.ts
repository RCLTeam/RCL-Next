import { safeStreamUrl } from '../../features/competition/api/competition-api.js';

const teamLogos = import.meta.glob<string>('/src/shared/assets/teams_logo/*.webp', {
  eager: true,
  query: '?url',
  import: 'default'
});

export function resolveTeamLogo(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const path = value.trim();
  if (/^\/(?!\/)/.test(path) && !/[\\\s]/.test(path)) {
    return teamLogos[path] ?? path;
  }
  return safeStreamUrl(path);
}
