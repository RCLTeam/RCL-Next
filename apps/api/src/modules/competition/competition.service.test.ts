import type { MatchMap } from '@rcl/contracts';
import { expect, test, vi } from 'vitest';
import type { CompetitionRepository, Match } from './competition.repository.js';
import { CompetitionService } from './competition.service.js';

const divisionId = '20000000-0000-4000-8000-000000000001';
const homeId = '30000000-0000-4000-8000-000000000001';
const awayId = '30000000-0000-4000-8000-000000000002';
const playerId = '40000000-0000-4000-8000-000000000001';

function completedMatch(index: number): Match {
  return {
    id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    divisionId,
    roundId: '1',
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeScore: 1,
    awayScore: 0,
    winnerTeamId: homeId,
    status: 'completed',
    bestOf: 1,
    scheduledAt: null,
    finishedAt: null,
    streamUrl: null,
    streamUrlLive: null
  };
}

function game(matchId: string, champion: string): MatchMap {
  return {
    id: `${matchId}-game`,
    gameNumber: 1,
    blueTeamId: homeId,
    redTeamId: awayId,
    winnerTeamId: homeId,
    durationSeconds: 1800,
    participants: [
      {
        id: `${matchId}-participant`,
        playerId,
        gameName: 'Player',
        riotTag: 'EUW',
        teamId: homeId,
        side: 'blue',
        champion,
        position: 'mid',
        build: null,
        stats: null,
        runes: null
      }
    ]
  };
}

function repository(matches: Match[]) {
  const matchGames = vi.fn(async (id: string) => [game(id, 'Ahri')]);
  const matchGamesByMatch = vi.fn(
    async (ids: string[]) =>
      new Map(ids.map((id, index) => [id, [game(id, index % 2 ? 'Orianna' : 'Ahri')]]))
  );
  const source: CompetitionRepository = {
    championPicks: async () => [],
    matchDirectory: async () => [],
    match: async () => undefined,
    matchGames,
    matchGamesByMatch,
    teamDirectory: async () => [
      { id: homeId, name: 'Rebels', seasonName: '2026', divisionName: 'Primera' }
    ],
    players: async () => [],
    playerDetail: async () => undefined,
    teamDetail: async () => ({
      id: homeId,
      divisionId,
      name: 'Rebels',
      shortName: null,
      logoUrl: null,
      color: null,
      isActive: true,
      seasonName: '2026',
      divisionName: 'Primera',
      members: [
        {
          id: 'member',
          playerId,
          name: 'Player',
          role: 'mid',
          isCaptain: true,
          gameName: 'Player',
          riotTag: 'EUW',
          countryCode: null
        }
      ]
    }),
    seasons: async () => [],
    season: async () => undefined,
    divisions: async () => [],
    division: async () => undefined,
    teams: async () => [],
    rounds: async () => [],
    matches: async () => matches
  };
  return { source, matchGames, matchGamesByMatch };
}

test('Team detail loads the games of every completed match with one lookup', async () => {
  const matches = Array.from({ length: 20 }, (_, index) => completedMatch(index));
  matches.push({ ...completedMatch(20), status: 'scheduled', winnerTeamId: null });
  const { source, matchGames, matchGamesByMatch } = repository(matches);
  const detail = await new CompetitionService(source).teamDetail('rebels');
  expect(matchGames).not.toHaveBeenCalled();
  expect(matchGamesByMatch).toHaveBeenCalledTimes(1);
  expect(matchGamesByMatch).toHaveBeenCalledWith(matches.slice(0, 20).map((match) => match.id));
  expect(detail.members[0]?.rosterStats).toEqual({ games: 20, mvps: 0, champions: 2 });
});
