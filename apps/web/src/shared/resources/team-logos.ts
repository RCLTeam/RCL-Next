import { safeStreamUrl } from '../../features/competition/api/competition-api.js';

export const teamLogoDirectory = '/api/v1/team-logos/images/';
const publicTeamLogoDirectory = '/images/teams_logo/';
const legacyTeamLogoDirectory = '/src/shared/assets/teams_logo/';

// Existing database records can still contain the former asset location.
export function normalizeTeamLogoPath(path: string): string {
  const directory = [legacyTeamLogoDirectory, publicTeamLogoDirectory].find((prefix) =>
    path.startsWith(prefix)
  );
  return directory ? `${teamLogoDirectory}${path.slice(directory.length)}` : path;
}

export function resolveTeamLogo(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const path = value.trim();
  if (/^\/(?!\/)/.test(path) && !/[\\\s]/.test(path)) {
    return normalizeTeamLogoPath(path);
  }
  return safeStreamUrl(path);
}
