type TeamRole = { discordRoleId?: string | null };

function hasRoleAtLeast(team: TeamRole | undefined, minimum: bigint): boolean {
  const roleId = team?.discordRoleId;
  return Boolean(roleId && BigInt(roleId) >= minimum);
}

// Zero is active; -10 belongs to withdrawn teams, not ghost teams.
export function isActiveTeam(team: TeamRole | undefined): boolean {
  return hasRoleAtLeast(team, 0n);
}

export function isTeamVisibleInCalendar(team: TeamRole | undefined): boolean {
  return hasRoleAtLeast(team, -10n);
}
