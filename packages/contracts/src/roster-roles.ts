/** Ordered by playing position, followed by substitutes. */
export const COMPETITIVE_ROLES = ['top', 'jungle', 'mid', 'adc', 'support', 'substitute'] as const;

export const NON_COMPETITIVE_ROLES = ['coach', 'staff', 'partners'] as const;
export const ROSTER_ROLES = [...COMPETITIVE_ROLES, ...NON_COMPETITIVE_ROLES] as const;

export type CompetitiveRole = (typeof COMPETITIVE_ROLES)[number];
export type NonCompetitiveRole = (typeof NON_COMPETITIVE_ROLES)[number];
export type RosterRole = (typeof ROSTER_ROLES)[number];

export function isCompetitiveRole(role: unknown): role is CompetitiveRole {
  return COMPETITIVE_ROLES.some((candidate) => candidate === role);
}

export function isNonCompetitiveRole(role: unknown): role is NonCompetitiveRole {
  return NON_COMPETITIVE_ROLES.some((candidate) => candidate === role);
}

/**
 * Resolve one person's membership in an explicit season, across all divisions.
 * Inactive teams are available only when requesting historical membership.
 * Captaincy and membership update order never affect competitive eligibility.
 */
export function competitiveTeamForSeason<
  T extends { role: RosterRole; seasonName: string; isActive: boolean }
>(
  memberships: readonly T[],
  seasonName: string,
  options: { includeInactive?: boolean } = {}
): T | null {
  const candidates = memberships.filter(
    (membership) => membership.seasonName === seasonName && isCompetitiveRole(membership.role)
  );
  // Do not hide inconsistent data by selecting whichever membership arrived first.
  if (candidates.length > 1) {
    throw new Error('Multiple competitive memberships in the same season');
  }
  const membership = candidates[0];
  return membership && (membership.isActive || options.includeInactive) ? membership : null;
}
