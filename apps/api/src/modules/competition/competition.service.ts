import { notFound } from '../../shared/app-error.js';
import type { CompetitionRepository, Match, Team } from './competition.repository.js';

export function calculateStandings(teams: Team[], matches: Match[]) {
  const totals = new Map(teams.map(team => [team.id, {
    team, played: 0, wins: 0, losses: 0, mapsWon: 0, mapsLost: 0, mapDifference: 0
  }]));
  for (const match of matches) {
    if (!['completed', 'forfeit'].includes(match.status) || !match.winnerTeamId) continue;
    const home = totals.get(match.homeTeamId);
    const away = totals.get(match.awayTeamId);
    if (!home || !away) continue;
    for (const [team, won, lost] of [[home, match.homeScore, match.awayScore], [away, match.awayScore, match.homeScore]] as const) {
      team.played++;
      team.wins += Number(match.winnerTeamId === team.team.id);
      team.losses += Number(match.winnerTeamId !== team.team.id);
      team.mapsWon += won;
      team.mapsLost += lost;
      team.mapDifference = team.mapsWon - team.mapsLost;
    }
  }
  // Preserve the legacy ordering. No extra tiebreak rule is assumed.
  return [...totals.values()]
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses ||
      b.mapDifference - a.mapDifference || a.team.name.localeCompare(b.team.name, 'es'))
    .map((row, index) => ({ position: index + 1, ...row }));
}

export class CompetitionService {
  constructor(private readonly repository: CompetitionRepository) {}
  seasons() { return this.repository.seasons(); }
  async divisions(seasonId: string) {
    if (!await this.repository.season(seasonId)) throw notFound('Season');
    return this.repository.divisions(seasonId);
  }
  private async assertDivision(id: string) {
    if (!await this.repository.division(id)) throw notFound('Division');
  }
  async teams(divisionId: string) {
    await this.assertDivision(divisionId);
    return this.repository.teams(divisionId);
  }
  async rounds(divisionId: string) {
    await this.assertDivision(divisionId);
    return this.repository.rounds(divisionId);
  }
  async calendar(divisionId: string, roundId?: string) {
    await this.assertDivision(divisionId);
    const [teams, rounds, matches] = await Promise.all([
      this.repository.teams(divisionId), this.repository.rounds(divisionId), this.repository.matches(divisionId)
    ]);
    if (roundId && !rounds.some(round => round.id === roundId)) throw notFound('Round');
    const teamIndex = new Map(teams.map(team => [team.id, team]));
    const roundIndex = new Map(rounds.map(round => [round.id, round]));
    return matches.filter(match => !roundId || match.roundId === roundId).map(match => ({
      ...match, homeTeam: teamIndex.get(match.homeTeamId), awayTeam: teamIndex.get(match.awayTeamId),
      round: match.roundId ? roundIndex.get(match.roundId) : null
    }));
  }
  async standings(divisionId: string, stage = 'regular') {
    await this.assertDivision(divisionId);
    const [teams, rounds, matches] = await Promise.all([
      this.repository.teams(divisionId), this.repository.rounds(divisionId), this.repository.matches(divisionId)
    ]);
    const roundIds = new Set(rounds.filter(round => round.stage === stage).map(round => round.id));
    return calculateStandings(teams, matches.filter(match => match.roundId && roundIds.has(match.roundId)));
  }
}
