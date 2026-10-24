import {
  COMPETITIVE_ROLES,
  NON_COMPETITIVE_ROLES,
  ROSTER_ROLES,
  type RosterRole,
  competitiveTeamForSeason,
  isCompetitiveRole,
  isNonCompetitiveRole
} from '@rcl/contracts';
import { expect, test } from 'vitest';
import { rosterRole } from '../../packages/database/src/schema.js';

const membership = (id: string, role: RosterRole, seasonName = 'T2', isActive = true) => ({
  id,
  role,
  seasonName,
  isActive,
  isCaptain: false
});

test('shared roles match the database enum and partition it without overlap', () => {
  expect(ROSTER_ROLES).toEqual(rosterRole.enumValues);
  expect(new Set(ROSTER_ROLES).size).toBe(ROSTER_ROLES.length);
  for (const role of COMPETITIVE_ROLES) {
    expect(isCompetitiveRole(role)).toBe(true);
    expect(isNonCompetitiveRole(role)).toBe(false);
  }
  for (const role of NON_COMPETITIVE_ROLES) {
    expect(isCompetitiveRole(role)).toBe(false);
    expect(isNonCompetitiveRole(role)).toBe(true);
  }
  for (const role of [null, undefined, '', 'captain', 'MID', {}, 1]) {
    expect(isCompetitiveRole(role)).toBe(false);
    expect(isNonCompetitiveRole(role)).toBe(false);
  }
});

test('competitive membership does not depend on input order or staff captaincy', () => {
  const player = membership('A', 'mid');
  const coach = { ...membership('B', 'coach'), isCaptain: true };
  const partner = membership('C', 'partners');
  expect(competitiveTeamForSeason([coach, player, partner], 'T2')).toBe(player);
  expect(competitiveTeamForSeason([partner, player, coach], 'T2')).toBe(player);
  expect(competitiveTeamForSeason([coach, partner], 'T2')).toBeNull();
});

test('substitutes qualify without games or captaincy', () => {
  const substitute = membership('A', 'substitute');
  expect(competitiveTeamForSeason([substitute], 'T2')).toBe(substitute);
});

test('season selection is explicit and never falls back to staff or another season', () => {
  const previous = membership('A', 'top', 'T1');
  const memberships = [membership('B', 'staff'), previous];
  expect(competitiveTeamForSeason(memberships, 'T2')).toBeNull();
  expect(competitiveTeamForSeason(memberships, 'T1')).toBe(previous);
  expect(competitiveTeamForSeason([], 'T2')).toBeNull();
});

test('inactive teams require an explicit historical request', () => {
  const inactive = membership('A', 'support', 'T2', false);
  expect(competitiveTeamForSeason([inactive], 'T2')).toBeNull();
  expect(competitiveTeamForSeason([inactive], 'T2', { includeInactive: true })).toBe(inactive);
});

test('historical lookup rejects two inactive competitive memberships in the same season', () => {
  const memberships = [
    membership('A', 'mid', 'T2', false),
    membership('B', 'substitute', 'T2', false)
  ];
  expect(() => competitiveTeamForSeason(memberships, 'T2', { includeInactive: true })).toThrow(
    'Multiple competitive memberships in the same season'
  );
});

test('conflicting memberships are rejected even if one team is inactive', () => {
  expect(() =>
    competitiveTeamForSeason(
      [membership('A', 'mid'), membership('B', 'substitute', 'T2', false)],
      'T2'
    )
  ).toThrow('Multiple competitive memberships in the same season');
});
