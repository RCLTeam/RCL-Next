import { isActiveTeam } from '../../../features/competition/team-visibility.js';
import type {
  Match,
  Standing,
  Team
} from '../../../features/competition/types/competition.types.js';

export type SlotId = 'a' | 'b' | 'u' | 'c' | 'd' | 'l' | 'lf' | 'f';
export interface BracketEntry {
  match?: Match;
  teams: [Team | undefined, Team | undefined];
}

export function outcome(match: Match | undefined, winner: boolean): Team | undefined {
  if (!match || !['completed', 'forfeit'].includes(match.status)) return;
  if (match.winnerTeamId) {
    if (match.winnerTeamId === match.homeTeam?.id) return winner ? match.homeTeam : match.awayTeam;
    if (match.winnerTeamId === match.awayTeam?.id) return winner ? match.awayTeam : match.homeTeam;
    return;
  }
  // Forfeits require an explicit winner; scores need not have been entered.
  if (match.status === 'forfeit' || match.homeScore === match.awayScore) return;
  return match.homeScore > match.awayScore === winner ? match.homeTeam : match.awayTeam;
}

export function buildPlayoff(
  matches: Match[],
  standings: Standing[]
): Record<SlotId, BracketEntry> {
  const activeStandings = standings
    .filter((row) => isActiveTeam(row.team))
    .sort((a, b) => a.position - b.position);
  const teamIndex = new Map(standings.map((row) => [row.team.id, row.team]));
  const eligible = (team: Team | undefined) =>
    !team || isActiveTeam(teamIndex.get(team.id) ?? team);
  const games = matches
    .filter(
      (match) =>
        match.round?.stage === 'playoff' &&
        match.status !== 'cancelled' &&
        eligible(match.homeTeam) &&
        eligible(match.awayTeam)
    )
    .sort(
      (a, b) => (a.round?.sequence ?? 0) - (b.round?.sequence ?? 0) || a.id.localeCompare(b.id)
    );
  const seed = (position: number) => activeStandings[position - 1]?.team;
  const used = new Set<string>();
  const entry = (teams: BracketEntry['teams'], match?: Match): BracketEntry => {
    if (match) used.add(match.id);
    return match ? { match, teams: [match.homeTeam, match.awayTeam] } : { teams };
  };
  const has = (match: Match, team: Team | undefined) =>
    !!team && (match.homeTeam?.id === team.id || match.awayTeam?.id === team.id);
  const firstRound = games[0]?.round?.sequence;
  const opening = games.filter(
    (match) => match.round?.sequence === firstRound && !has(match, seed(5)) && !has(match, seed(6))
  );
  const first = opening.find((match) => has(match, seed(1))) ?? opening[0];
  const a = entry([seed(1), undefined], first);
  const b = entry(
    [undefined, undefined],
    opening.find((match) => match.id !== first?.id)
  );
  const findPair = (one: Team | undefined, two: Team | undefined) =>
    games.find((match) => !used.has(match.id) && has(match, one) && has(match, two));
  const u = entry(
    [outcome(a.match, true), outcome(b.match, true)],
    findPair(outcome(a.match, true), outcome(b.match, true))
  );
  // The published lower pairings determine which upper loser meets each seed.
  const lower = (position: number) => {
    const team = seed(position);
    const match = games.find(
      (game) =>
        !used.has(game.id) &&
        has(game, team) &&
        (has(game, outcome(a.match, false)) || has(game, outcome(b.match, false)))
    );
    return entry([team, undefined], match);
  };
  const c = lower(5);
  const d = lower(6);
  const l = entry(
    [outcome(c.match, true), outcome(d.match, true)],
    findPair(outcome(c.match, true), outcome(d.match, true))
  );
  const lf = entry(
    [outcome(u.match, false), outcome(l.match, true)],
    findPair(outcome(u.match, false), outcome(l.match, true))
  );
  const f = entry(
    [outcome(u.match, true), outcome(lf.match, true)],
    findPair(outcome(u.match, true), outcome(lf.match, true))
  );
  return { a, b, u, c, d, l, lf, f };
}
