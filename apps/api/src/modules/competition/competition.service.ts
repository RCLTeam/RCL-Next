import type { MatchDetail } from '@rcl/contracts';
import { notFound } from '../../shared/app-error.js';
import type { CompetitionRepository, Match, Team } from './competition.repository.js';
import { profileSlugs, resolveProfileId } from './profile-slugs.js';

export function calculateStandings(teams: Team[], matches: Match[]) {
  const totals = new Map(
    teams.map((team) => [
      team.id,
      {
        team,
        played: 0,
        wins: 0,
        losses: 0,
        mapsWon: 0,
        mapsLost: 0,
        mapDifference: 0
      }
    ])
  );
  for (const match of matches) {
    if (!['completed', 'forfeit'].includes(match.status) || !match.winnerTeamId) continue;
    const home = totals.get(match.homeTeamId);
    const away = totals.get(match.awayTeamId);
    if (!home || !away) continue;
    for (const [team, won, lost] of [
      [home, match.homeScore, match.awayScore],
      [away, match.awayScore, match.homeScore]
    ] as const) {
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
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        a.losses - b.losses ||
        b.mapDifference - a.mapDifference ||
        a.team.name.localeCompare(b.team.name, 'es')
    )
    .map((row, index) => ({ position: index + 1, ...row }));
}

export class CompetitionService {
  constructor(private readonly repository: CompetitionRepository) {}
  private async matchSlugs() {
    const [matches, teams] = await Promise.all([
      this.repository.matchDirectory(),
      this.repository.teamDirectory()
    ]);
    const index = new Map(teams.map((team) => [team.id, team]));
    return profileSlugs(
      matches.map((match) => {
        const home = index.get(match.homeTeamId);
        return {
          id: match.id,
          name: `${home?.name ?? 'Equipo'} vs ${index.get(match.awayTeamId)?.name ?? 'Equipo'}`,
          context: `${home?.seasonName ?? ''} ${home?.divisionName ?? ''} jornada ${match.roundId ?? ''}`
        };
      }),
      'partido'
    );
  }
  async matchDetail(reference: string): Promise<MatchDetail> {
    const slugs = await this.matchSlugs();
    const id = resolveProfileId(reference, slugs);
    if (!id) throw notFound('Match');
    const match = await this.repository.match(id);
    if (!match || (match.status !== 'completed' && match.status !== 'forfeit'))
      throw notFound('Match');
    const [teams, division, rounds, games] = await Promise.all([
      this.repository.teams(match.divisionId),
      this.repository.division(match.divisionId),
      this.repository.rounds(match.divisionId),
      this.repository.matchGames(id)
    ]);
    const homeTeam = teams.find((team) => team.id === match.homeTeamId);
    const awayTeam = teams.find((team) => team.id === match.awayTeamId);
    if (!homeTeam || !awayTeam || !division) throw notFound('Match');
    return {
      id,
      slug: slugs.get(id),
      homeTeam,
      awayTeam,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      bestOf: match.bestOf,
      status: match.status,
      winnerTeamId: match.winnerTeamId,
      seasonName: division.seasonId,
      divisionName: division.name,
      roundName: rounds.find((round) => round.id === match.roundId)?.name ?? null,
      games
    };
  }
  private async teamSlugs() {
    const teams = await this.repository.teamDirectory();
    return profileSlugs(
      teams.map((team) => ({ ...team, context: `${team.seasonName} ${team.divisionName}` })),
      'equipo'
    );
  }
  private async playerDirectory() {
    const players = await this.repository.players();
    const slugs = profileSlugs(
      players.map((player) => ({
        id: player.id,
        name: `${player.gameName} ${player.riotTag ?? ''}`
      })),
      'jugador'
    );
    return { players, slugs };
  }
  async players() {
    const { players, slugs } = await this.playerDirectory();
    return players.map((player) => ({ ...player, slug: slugs.get(player.id) }));
  }
  async playerDetail(reference: string) {
    const { slugs } = await this.playerDirectory();
    const id = resolveProfileId(reference, slugs);
    if (!id) throw notFound('Player');
    const player = await this.repository.playerDetail(id);
    if (!player) throw notFound('Player');
    const teamSlugs = await this.teamSlugs();
    return {
      ...player,
      slug: slugs.get(id),
      teams: player.teams.map((team) => ({ ...team, slug: teamSlugs.get(team.id) }))
    };
  }
  async teamDetail(reference: string) {
    const slugs = await this.teamSlugs();
    const id = resolveProfileId(reference, slugs);
    if (!id) throw notFound('Team');
    const team = await this.repository.teamDetail(id);
    if (!team) throw notFound('Team');
    const { slugs: playerSlugs } = await this.playerDirectory();
    return {
      ...team,
      slug: slugs.get(id),
      members: team.members.map((member) => ({
        ...member,
        playerSlug: member.playerId ? playerSlugs.get(member.playerId) : undefined
      }))
    };
  }
  seasons() {
    return this.repository.seasons();
  }
  async divisions(seasonId: string) {
    if (!(await this.repository.season(seasonId))) throw notFound('Season');
    return this.repository.divisions(seasonId);
  }
  private async assertDivision(id: string) {
    if (!(await this.repository.division(id))) throw notFound('Division');
  }
  async teams(divisionId: string) {
    await this.assertDivision(divisionId);
    const [teams, slugs] = await Promise.all([this.repository.teams(divisionId), this.teamSlugs()]);
    return teams.map((team) => ({ ...team, slug: slugs.get(team.id) }));
  }
  async rounds(divisionId: string) {
    await this.assertDivision(divisionId);
    return this.repository.rounds(divisionId);
  }
  async calendar(divisionId: string, roundId?: string) {
    await this.assertDivision(divisionId);
    const [teams, rounds, matches] = await Promise.all([
      this.repository.teams(divisionId),
      this.repository.rounds(divisionId),
      this.repository.matches(divisionId)
    ]);
    if (roundId && !rounds.some((round) => round.id === roundId)) throw notFound('Round');
    const teamIndex = new Map(teams.map((team) => [team.id, team]));
    const roundIndex = new Map(rounds.map((round) => [round.id, round]));
    const slugs = await this.matchSlugs();
    return matches
      .filter((match) => !roundId || match.roundId === roundId)
      .map((match) => ({
        ...match,
        slug: slugs.get(match.id),
        homeTeam: teamIndex.get(match.homeTeamId),
        awayTeam: teamIndex.get(match.awayTeamId),
        round: match.roundId ? roundIndex.get(match.roundId) : null
      }));
  }
  async standings(divisionId: string, stage = 'regular') {
    await this.assertDivision(divisionId);
    const [teams, rounds, matches] = await Promise.all([
      this.repository.teams(divisionId),
      this.repository.rounds(divisionId),
      this.repository.matches(divisionId)
    ]);
    const roundIds = new Set(
      rounds.filter((round) => round.stage === stage).map((round) => round.id)
    );
    return calculateStandings(
      teams,
      matches.filter((match) => match.roundId && roundIds.has(match.roundId))
    );
  }
}
