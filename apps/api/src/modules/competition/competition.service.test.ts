import type { MatchMap, MatchPlayerStats } from '@rcl/contracts';
import { expect, test, vi } from 'vitest';
import type { CompetitionRepository, Match } from './competition.repository.js';
import { CompetitionService } from './competition.service.js';
import type { PlayerGameRow } from './player-statistics.js';

const divisionId = '20000000-0000-4000-8000-000000000001';
const homeId = '30000000-0000-4000-8000-000000000001';
const awayId = '30000000-0000-4000-8000-000000000002';
const playerId = '40000000-0000-4000-8000-000000000001';

function completedMatch(index: number): Match {
  return {
    mvpPlayerId: null,
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
    playerSeasonGames: async () => ({ playerGames: [], allMatchGames: [], mvpMatchIds: [] }),
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
  expect(detail.members[0]?.champion).toBeNull();
});

test('Team champion uses the player season history rather than only current-team games', async () => {
  const { source } = repository([completedMatch(0)]);
  const seasonGames = ['Orianna', 'Ahri', 'Orianna'].map(
    (champion, index): PlayerGameRow => ({
      playerId,
      gameId: `g${index}`,
      matchId: `m${index}`,
      divisionId,
      roundId: 1,
      teamId: awayId,
      team: { id: awayId, name: 'Previous team', shortName: null, logoUrl: null },
      position: 'mid',
      champion,
      durationSeconds: 1800,
      winnerTeamId: awayId,
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
      damageToChampions: 0,
      goldEarned: null,
      visionScore: null,
      damageMitigated: null
    })
  );
  source.playerSeasonGames = vi.fn(async () => ({
    playerGames: seasonGames,
    allMatchGames: seasonGames,
    mvpMatchIds: []
  }));
  expect((await new CompetitionService(source).teamDetail('rebels')).members[0]?.champion).toBe(
    'Orianna'
  );
  expect(source.playerSeasonGames).toHaveBeenCalledWith(playerId, '2026');
  const empty = repository([]);
  expect(
    (await new CompetitionService(empty.source).teamDetail('rebels')).members[0]?.champion
  ).toBeNull();
});

test('Player detail displays season-wide statistics and MVPs across transfers while showing active team', async () => {
  const teamAId = '30000000-0000-4000-8000-000000000001';
  const teamBId = '30000000-0000-4000-8000-000000000002';
  const division1Id = '20000000-0000-4000-8000-000000000001';
  const division2Id = '20000000-0000-4000-8000-000000000002';
  const transferredPlayerId = '40000000-0000-4000-8000-000000000099';

  const playerGame1: PlayerGameRow = {
    playerId: transferredPlayerId,
    gameId: 'g1',
    matchId: 'm1',
    divisionId: division1Id,
    roundId: 1,
    teamId: teamAId,
    team: { id: teamAId, name: 'Team A', shortName: 'TA', logoUrl: null, color: null },
    position: 'mid',
    champion: 'Ahri',
    durationSeconds: 1800,
    winnerTeamId: teamAId,
    kills: 10,
    deaths: 1,
    assists: 8,
    cs: 250,
    damageToChampions: 25000,
    goldEarned: 14000,
    visionScore: 30,
    damageMitigated: 10000
  };

  const opponentGame1: PlayerGameRow = {
    playerId: 'opponent',
    gameId: 'g1',
    matchId: 'm1',
    divisionId: division1Id,
    roundId: 1,
    teamId: 'other-team',
    team: { id: 'other-team', name: 'Other', shortName: null, logoUrl: null, color: null },
    position: 'mid',
    champion: 'Syndra',
    durationSeconds: 1800,
    winnerTeamId: teamAId,
    kills: 1,
    deaths: 5,
    assists: 1,
    cs: 180,
    damageToChampions: 12000,
    goldEarned: 9000,
    visionScore: 15,
    damageMitigated: 5000
  };

  const playerGames = [playerGame1];
  const allMatchGames = [playerGame1, opponentGame1];

  const source: CompetitionRepository = {
    championPicks: async () => [],
    matchDirectory: async () => [],
    match: async () => undefined,
    matchGames: async () => [],
    matchGamesByMatch: async () => new Map(),
    teamDirectory: async () => [
      { id: teamAId, name: 'Team A', seasonName: '2026', divisionName: 'Primera' },
      { id: teamBId, name: 'Team B', seasonName: '2026', divisionName: 'Segunda' }
    ],
    players: async () => [
      {
        id: transferredPlayerId,
        gameName: 'TransferredPlayer',
        riotTag: 'EUW',
        displayName: null,
        countryCode: null,
        isMain: true
      }
    ],
    playerSeasonGames: async (pId, season) => {
      expect(pId).toBe(transferredPlayerId);
      expect(season).toBe('2026');
      return { playerGames, allMatchGames, mvpMatchIds: ['m1'] };
    },
    playerDetail: async (id) => ({
      id,
      gameName: 'TransferredPlayer',
      riotTag: 'EUW',
      displayName: null,
      countryCode: null,
      isMain: true,
      linkedAccounts: [],
      teams: [
        {
          id: teamBId,
          name: 'Team B',
          shortName: 'TB',
          logoUrl: null,
          color: '#00ff00',
          seasonName: '2026',
          divisionName: 'Segunda',
          divisionId: division2Id,
          role: 'top',
          isCaptain: false,
          isActive: true
        },
        {
          id: teamAId,
          name: 'Team A',
          shortName: 'TA',
          logoUrl: null,
          color: '#ff0000',
          seasonName: '2026',
          divisionName: 'Primera',
          divisionId: division1Id,
          role: 'mid',
          isCaptain: true,
          isActive: true
        }
      ]
    }),
    teamDetail: async () => undefined,
    seasons: async () => [],
    season: async () => undefined,
    divisions: async () => [],
    division: async () => undefined,
    teams: async () => [],
    rounds: async () => [],
    matches: async () => []
  };

  const service = new CompetitionService(source);
  const detail = await service.playerDetail(transferredPlayerId);

  expect(detail.competition?.team?.name).toBe('Team B');
  expect(detail.competition?.role).toBe('top');
  expect(detail.competition?.isCaptain).toBe(false);
  expect(detail.competition?.champion).toBe('Ahri');
  expect(detail.competition?.stats?.games).toBe(1);
  expect(detail.competition?.mvpMatchIds).toEqual(['m1']);

  // Leaving every team must preserve the same season history.
  const withTeams = source.playerDetail;
  source.playerDetail = async (id) => {
    const player = await withTeams(id);
    if (!player) throw new Error('Missing fixture');
    return { ...player, teams: [] };
  };
  source.seasons = async () => [
    { id: '2027', name: '2027', startsOn: '2027-01-01', endsOn: null },
    { id: '2026', name: '2026', startsOn: '2026-01-01', endsOn: null }
  ];
  const seasonGames = source.playerSeasonGames;
  source.playerSeasonGames = async (id, season) =>
    season === '2027'
      ? { playerGames: [], allMatchGames: [], mvpMatchIds: [] }
      : seasonGames(id, season);
  const withoutTeam = await service.playerDetail(transferredPlayerId);
  expect(withoutTeam.teams).toEqual([]);
  expect(withoutTeam.competition?.team).toBeNull();
  expect(withoutTeam.competition?.stats?.games).toBe(1);
  expect(withoutTeam.competition?.mvpMatchIds).toEqual(['m1']);

  source.playerSeasonGames = async () => ({
    playerGames: [],
    allMatchGames: [],
    mvpMatchIds: ['m1']
  });
  const awardsOnly = await service.playerDetail(transferredPlayerId);
  expect(awardsOnly.competition?.stats).toBeNull();
  expect(awardsOnly.competition?.mvpMatchIds).toEqual(['m1']);
});

test('Team detail only counts MVPs won while playing for that specific team', async () => {
  const teamAId = '30000000-0000-4000-8000-000000000001';
  const teamBId = '30000000-0000-4000-8000-000000000002';
  const divisionId = '20000000-0000-4000-8000-000000000001';
  const playerId = '40000000-0000-4000-8000-000000000001';

  // Match 1: Player played for Team A against Team B, and won MVP
  const match1: Match = {
    mvpPlayerId: playerId,
    id: '70000000-0000-4000-8000-000000000001',
    divisionId,
    roundId: '1',
    homeTeamId: teamAId,
    awayTeamId: teamBId,
    homeScore: 1,
    awayScore: 0,
    winnerTeamId: teamAId,
    status: 'completed',
    bestOf: 1,
    scheduledAt: null,
    finishedAt: null,
    streamUrl: null,
    streamUrlLive: null
  };

  const match1Game: MatchMap = {
    id: 'g1',
    gameNumber: 1,
    blueTeamId: teamAId,
    redTeamId: teamBId,
    winnerTeamId: teamAId,
    durationSeconds: 1800,
    participants: [
      {
        id: 'p1',
        playerId,
        gameName: 'Player',
        riotTag: 'EUW',
        teamId: teamAId, // played for Team A
        side: 'blue',
        champion: 'Ahri',
        position: 'mid',
        build: null,
        runes: null,
        stats: {
          kills: 10,
          deaths: 0,
          assists: 10,
          cs: 250,
          damageToChampions: 30000,
          goldEarned: 15000,
          visionScore: 30,
          damageMitigated: 10000
        } as unknown as MatchPlayerStats
      }
    ]
  };

  const source: CompetitionRepository = {
    championPicks: async () => [],
    matchDirectory: async () => [],
    match: async () => undefined,
    matchGames: async () => [match1Game],
    matchGamesByMatch: async () => new Map([[match1.id, [match1Game]]]),
    teamDirectory: async () => [
      { id: teamAId, name: 'Team A', seasonName: '2026', divisionName: 'Primera' },
      { id: teamBId, name: 'Team B', seasonName: '2026', divisionName: 'Primera' }
    ],
    players: async () => [],
    playerSeasonGames: async () => ({ playerGames: [], allMatchGames: [], mvpMatchIds: [] }),
    playerDetail: async () => undefined,
    teamDetail: async (id) => ({
      id,
      divisionId,
      name: id === teamBId ? 'Team B' : 'Team A',
      shortName: null,
      logoUrl: null,
      color: null,
      isActive: true,
      seasonName: '2026',
      divisionName: 'Primera',
      members: [
        {
          id: 'member-1',
          playerId,
          name: 'Player',
          role: 'mid',
          isCaptain: false,
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
    matches: async () => [match1]
  };

  const service = new CompetitionService(source);

  // Player transferred to Team B, but the MVP was earned while playing for Team A.
  // Team B rosterStats should have mvps: 0
  const teamBDetail = await service.teamDetail(teamBId);
  expect(teamBDetail.members[0]?.rosterStats?.mvps).toBe(0);

  // Team A rosterStats should have mvps: 1
  const teamADetail = await service.teamDetail(teamAId);
  expect(teamADetail.members[0]?.rosterStats?.mvps).toBe(1);
});

test('Player detail gracefully handles player with active team membership but zero games played in the season', async () => {
  const teamId = '30000000-0000-4000-8000-000000000001';
  const divisionId = '20000000-0000-4000-8000-000000000001';
  const zeroGamesPlayerId = '40000000-0000-4000-8000-000000000003';

  const source: CompetitionRepository = {
    championPicks: async () => [],
    matchDirectory: async () => [],
    match: async () => undefined,
    matchGames: async () => [],
    matchGamesByMatch: async () => new Map(),
    teamDirectory: async () => [
      { id: teamId, name: 'Bench Team', seasonName: '2026', divisionName: 'Primera' }
    ],
    players: async () => [],
    playerSeasonGames: async () => ({ playerGames: [], allMatchGames: [], mvpMatchIds: ['m1'] }),
    playerDetail: async (id) => ({
      id,
      gameName: 'BenchPlayer',
      riotTag: 'EUW',
      displayName: null,
      countryCode: null,
      isMain: true,
      linkedAccounts: [],
      teams: [
        {
          id: teamId,
          name: 'Bench Team',
          shortName: 'BT',
          logoUrl: null,
          color: '#123456',
          seasonName: '2026',
          divisionName: 'Primera',
          divisionId,
          role: 'support',
          isCaptain: true,
          isActive: true
        }
      ]
    }),
    teamDetail: async () => undefined,
    seasons: async () => [],
    season: async () => undefined,
    divisions: async () => [],
    division: async () => undefined,
    teams: async () => [],
    rounds: async () => [],
    matches: async () => []
  };

  const service = new CompetitionService(source);
  const detail = await service.playerDetail(zeroGamesPlayerId);

  expect(detail.competition?.team?.name).toBe('Bench Team');
  expect(detail.competition?.role).toBe('support');
  expect(detail.competition?.isCaptain).toBe(true);
  expect(detail.competition?.stats).toBeNull();
  expect(detail.competition?.champion).toBeNull();
  expect(detail.competition?.mvpMatchIds).toEqual(['m1']);
});

test('Featured lineup prefers a played starter and otherwise the most used player in that team position', async () => {
  const { source, matchGamesByMatch } = repository([completedMatch(0)]);
  const match = completedMatch(0);
  const substituteGame = (id: string, position: string) => {
    const map = game(match.id, 'Ahri');
    map.participants = map.participants.map((entry) => ({
      ...entry,
      playerId: id,
      gameName: id,
      position
    }));
    return map;
  };
  const maps = [
    substituteGame('sub', 'mid'),
    substituteGame('sub', 'mid'),
    substituteGame('other', 'mid'),
    substituteGame('jungler', 'jungle')
  ];
  matchGamesByMatch.mockResolvedValue(new Map([[match.id, maps]]));
  let detail = await new CompetitionService(source).teamDetail('rebels');
  expect(detail.featuredLineup?.find((member) => member.role === 'mid')?.playerId).toBe('sub');
  expect(detail.members[0]?.playerId).toBe(playerId);
  maps.push(game(match.id, 'Ahri'));
  detail = await new CompetitionService(source).teamDetail('rebels');
  expect(detail.featuredLineup?.find((member) => member.role === 'mid')?.playerId).toBe(playerId);
  const empty = repository([]);
  expect(
    (await new CompetitionService(empty.source).teamDetail('rebels')).featuredLineup?.find(
      (member) => member.role === 'mid'
    )?.playerId
  ).toBe(playerId);
});
