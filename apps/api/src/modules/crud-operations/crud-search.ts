import * as schema from '@rcl/database/schema';
import { type SQL, and, eq, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export interface CrudSearchTerm {
  text: string;
  escaped: string;
  pattern: string;
  exactNumber: string | null;
}

// A trailing space after a number asks for that exact number: "1" finds 1, 10, 11; "1 " finds 1.
export function parseCrudSearch(raw: string): CrudSearchTerm {
  const text = raw.trim();
  const escaped = text.replace(/[\\%_]/g, '\\$&');
  return {
    text,
    escaped,
    pattern: `%${escaped}%`,
    exactNumber: /^\d+\s+$/.test(raw) ? text : null
  };
}

const exists = (query: SQL): SQL => sql`EXISTS (${query})`;

const contains = (value: AnyPgColumn | SQL, term: CrudSearchTerm): SQL =>
  sql`${value}::text ILIKE ${term.pattern}`;

const riotAccount = (term: CrudSearchTerm) => [
  contains(schema.players.gameName, term),
  contains(schema.players.riotTag, term),
  contains(sql`${schema.players.gameName} || '#' || ${schema.players.riotTag}`, term)
];

const teamIdentity = (term: CrudSearchTerm) => [
  contains(schema.teams.name, term),
  contains(schema.teams.shortName, term)
];

function membershipSearch(term: CrudSearchTerm) {
  const [gameName, , riotId] = riotAccount(term);
  const account = or(gameName, riotId);
  return [
    exists(
      sql`SELECT 1 FROM ${schema.teams} WHERE ${and(
        eq(schema.teams.id, schema.teamMemberships.teamId),
        contains(schema.teams.name, term)
      )}`
    ),
    exists(
      sql`SELECT 1 FROM ${schema.players} WHERE ${and(
        eq(schema.players.discordUserId, schema.teamMemberships.discordUserId),
        account
      )}`
    )
  ];
}

function roundSearch(term: CrudSearchTerm) {
  if (term.exactNumber) return [sql`${schema.rounds.id}::text = ${term.exactNumber}`];
  return [contains(schema.rounds.name, term), contains(schema.rounds.id, term)];
}

function matchSearch(term: CrudSearchTerm) {
  return [
    exists(
      sql`SELECT 1 FROM ${schema.teams} WHERE ${and(
        or(
          eq(schema.teams.id, schema.matches.team1Id),
          eq(schema.teams.id, schema.matches.team2Id)
        ),
        or(...teamIdentity(term))
      )}`
    )
  ];
}

// Explicit allowlist: each resource only searches what an administrator can identify it by.
const searches: Record<string, (term: CrudSearchTerm) => SQL[]> = {
  seasons: (term) => [contains(schema.seasons.name, term)],
  divisions: (term) => [contains(schema.divisions.name, term)],
  competitions: (term) => [
    contains(schema.seasonsDivisions.seasonName, term),
    contains(schema.seasonsDivisions.divisionName, term)
  ],
  teams: teamIdentity,
  users: (term) => [
    contains(schema.discordUsers.username, term),
    contains(schema.discordUsers.globalName, term)
  ],
  players: riotAccount,
  memberships: membershipSearch,
  rounds: roundSearch,
  matches: matchSearch
};

export function crudSearchCondition(resource: string, term: CrudSearchTerm) {
  const search = searches[resource];
  if (!search) throw new Error(`Missing CRUD search definition for ${resource}.`);
  return or(...search(term));
}

const latestSeason = sql`(
  SELECT ${schema.seasons.name} FROM ${schema.seasons}
  ORDER BY ${schema.seasons.startsOn} DESC NULLS LAST, ${schema.seasons.name} DESC
  LIMIT 1
)`;

const inLatestSeason = (competition: AnyPgColumn) =>
  sql`${competition} IN (
    SELECT ${schema.seasonsDivisions.id} FROM ${schema.seasonsDivisions}
    WHERE ${schema.seasonsDivisions.seasonName} = ${latestSeason}
  )`;

const seasonScopes: Record<string, () => SQL> = {
  competitions: () => sql`${schema.seasonsDivisions.seasonName} = ${latestSeason}`,
  teams: () => sql`${schema.teams.seasonName} = ${latestSeason}`,
  memberships: () => sql`${schema.teamMemberships.seasonName} = ${latestSeason}`,
  rounds: () => inLatestSeason(schema.rounds.idSeasonDivision),
  matches: () => inLatestSeason(schema.matches.idSeasonDivision)
};

export const crudLatestSeasonCondition = (resource: string) => seasonScopes[resource]?.();
