import type { MatchMap, MatchPlayerStats, PlayerDetail, PlayerTeam } from '@rcl/contracts';
import { expect, test, vi } from 'vitest';
import type { CompetitionRepository, Match } from './competition.repository.js';
import { CompetitionService } from './competition.service.js';
import type { PlayerGameRow } from './player-statistics.js';

const divisionId = '20000000-0000-4000-8000-000000000001';
const homeId = '30000000-0000-4000-8000-000000000001';
const awayId = '30000000-0000-4000-8000-000000000002';
const playerId = '40000000-0000-4000-8000-000000000001';

function profileTeam(id: string, role: PlayerTeam['role'], seasonName = '2026'): PlayerTeam {
  return {
    id,
    name: id,
    shortName: null,
    logoUrl: null,
    color: '#123456',
    seasonName,
    divisionName: 'Primera',
    role,
    isCaptain: false,
    isActive: true
  };
}

function profileRepository(teams: PlayerTeam[]) {
  const { source } = repository([]);
  const player: PlayerDetail = {
    id: playerId,
    gameName: 'Player',
    riotTag: 'EUW',
    displayName: null,
    countryCode: null,
    isMain: true,
    teams
  };
  source.players = async () => [player];
  source.playerDetail = async () => player;
  source.seasons = async () => [
    { id: '2027', name: '2027', startsOn: '2027-01-01', endsOn: null },
    { id: '2026', name: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31' }
  ];
  source.teamDirectory = async () => teams;
  const seasonGames = vi.fn<CompetitionRepository['playerSeasonGames']>(async () => ({
    playerGames: [],
    allMatchGames: [],
    mvpMatchIds: []
  }));
  source.playerSeasonGames = seasonGames;
  return { source, player, seasonGames, service: new CompetitionService(source) };
}

test.each(['coach', 'staff', 'partners'] as const)(
  'a newer %s affiliation never overrides competitive registration or statistics season',
  async (role) => {
    const competitive = { ...profileTeam(homeId, 'mid'), isCaptain: true };
    const other = profileTeam(awayId, role, '2027');
    const { service, player, seasonGames } = profileRepository([other, competitive]);
    for (const teams of [
      [other, competitive],
      [competitive, other]
    ]) {
      player.teams = teams;
      const detail = await service.playerDetail(playerId);
      expect(detail.registrationTeam).toMatchObject({ id: homeId, role: 'mid', isCaptain: true });
      expect(detail.registrationTeam?.slug).toBeTruthy();
      expect(detail.statisticsSeasonName).toBe('2026');
      expect(detail.competition).toMatchObject({
        team: { id: homeId },
        role: 'mid',
        isCaptain: true
      });
      expect(detail.teams.map((team) => team.id)).toEqual(teams.map((team) => team.id));
    }
    expect(seasonGames.mock.calls).toEqual([
      [playerId, '2026'],
      [playerId, '2026']
    ]);
  }
);

test('same-season staff captaincy cannot override the player role or captaincy', async () => {
  const { service } = profileRepository([
    { ...profileTeam(awayId, 'staff'), isCaptain: true },
    profileTeam(homeId, 'substitute')
  ]);
  const detail = await service.playerDetail(playerId);
  expect(detail.competition).toMatchObject({
    role: 'substitute',
    isCaptain: false,
    team: { id: homeId }
  });
});

test('season chronology selects the latest registration, including inactive historical teams', async () => {
  const { service, seasonGames } = profileRepository([
    profileTeam(homeId, 'mid'),
    { ...profileTeam(awayId, 'substitute', '2027'), isActive: false }
  ]);
  const detail = await service.playerDetail(playerId);
  expect(detail.registrationTeam).toMatchObject({ id: awayId, isActive: false });
  expect(detail.statisticsSeasonName).toBe('2027');
  expect(detail.competition?.stats).toBeNull();
  expect(seasonGames.mock.calls).toEqual([[playerId, '2027']]);
});

test('staff-only profiles recover historical awards without claiming a competitive team', async () => {
  const { service, seasonGames } = profileRepository([profileTeam(awayId, 'coach', '2027')]);
  seasonGames.mockImplementation(async (_id, season) => ({
    playerGames: [],
    allMatchGames: [],
    mvpMatchIds: season === '2026' ? ['historic-award'] : []
  }));
  const detail = await service.playerDetail(playerId);
  expect(detail.registrationTeam).toBeNull();
  expect(detail.statisticsSeasonName).toBe('2026');
  expect(detail.competition).toMatchObject({
    team: null,
    role: null,
    isCaptain: false,
    stats: null,
    mvpMatchIds: ['historic-award']
  });
});

test('profiles without competitive registration or results clear stale projections', async () => {
  const { service, player } = profileRepository([profileTeam(awayId, 'staff')]);
  player.competition = {
    role: 'staff',
    team: player.teams[0] ?? null,
    isCaptain: true,
    champion: 'Ahri',
    stats: null,
    mvpMatchIds: ['stale'],
    featured: null
  };
  const detail = await service.playerDetail(playerId);
  expect(detail.registrationTeam).toBeNull();
  expect(detail.statisticsSeasonName).toBeNull();
  expect(detail.competition).toEqual({
    team: null,
    role: null,
    isCaptain: false,
    champion: null,
    stats: null,
    mvpMatchIds: [],
    featured: null
  });
});

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
    seasons: async () => [{ id: '2026', name: '2026', startsOn: '2026-01-01', endsOn: null }],
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
          role: 'coach',
          isCaptain: false,
          isActive: true
        }
      ]
    }),
    teamDetail: async () => undefined,
    seasons: async () => [{ id: '2026', name: '2026', startsOn: '2026-01-01', endsOn: null }],
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
  expect(detail.registrationTeam?.id).toBe(teamBId);
  expect(detail.statisticsSeasonName).toBe('2026');
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
    seasons: async () => [{ id: '2026', name: '2026', startsOn: '2026-01-01', endsOn: null }],
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
    seasons: async () => [{ id: '2026', name: '2026', startsOn: '2026-01-01', endsOn: null }],
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
