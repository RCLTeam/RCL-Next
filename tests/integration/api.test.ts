import request from 'supertest';
import { expect, test } from 'vitest';
import { vi } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import type {
  CompetitionRepository,
  Match,
  Team
} from '../../apps/api/src/modules/competition/competition.repository.js';
import { CompetitionService } from '../../apps/api/src/modules/competition/competition.service.js';

const seasonId = '10000000-0000-4000-8000-000000000001';
const divisionId = '20000000-0000-4000-8000-000000000001';
const roundId = '1';
const homeId = '30000000-0000-4000-8000-000000000001';
const awayId = '30000000-0000-4000-8000-000000000002';
const teams: Team[] = [homeId, awayId].map((id, index) => ({
  id,
  divisionId,
  name: index ? 'B' : 'A',
  shortName: null,
  logoUrl: null,
  color: null,
  isActive: true,
  discordRoleId: null
}));
const match: Match = {
  id: '70000000-0000-4000-8000-000000000001',
  divisionId,
  roundId,
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
function repository(): CompetitionRepository {
  const season = { id: seasonId, name: 'Demo', startsOn: null, endsOn: null };
  const division = { id: divisionId, seasonId, code: 'premier', name: 'Premier', sortOrder: 1 };
  return {
    players: async () => [],
    playerDetail: async () => undefined,
    matchDirectory: async () => [],
    match: async () => undefined,
    matchGames: async () => [],
    matchGamesByMatch: async () => new Map(),
    championPicks: async () => [],
    teamDirectory: async () => [],
    teamDetail: async () => undefined,
    seasons: async () => [season],
    season: async (id) => (id === seasonId ? season : undefined),
    divisions: async () => [division],
    division: async (id) => (id === divisionId ? division : undefined),
    teams: async () => teams,
    rounds: async () => [
      {
        id: roundId,
        divisionId,
        sequence: 1,
        stage: 'regular',
        name: 'J1',
        startsAt: null,
        lockAt: null
      },
      {
        id: awayId,
        divisionId,
        sequence: 1,
        stage: 'playoffs',
        name: 'Final',
        startsAt: null,
        lockAt: null
      }
    ],
    matches: async () => [
      match,
      { ...match, roundId: awayId, winnerTeamId: awayId, homeScore: 0, awayScore: 3 },
      { ...match, id: awayId, status: 'scheduled', winnerTeamId: null, homeScore: 0, awayScore: 0 }
    ]
  };
}
const app = createApp({
  repository: repository(),
  checkDatabase: async () => {},
  corsOrigin: 'http://localhost:5173'
});

test('public avatar route serves images through the full app without Discord cookies', async () => {
  const fetchImage = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { 'content-type': 'image/png', 'set-cookie': '__cf_bm=private' }
    })
  );
  vi.stubGlobal('fetch', fetchImage);
  try {
    const avatarApp = createApp({
      repository: repository(),
      checkDatabase: async () => {},
      corsOrigin: 'http://localhost:5173'
    });
    const result = await request(avatarApp)
      .get('/api/v1/discord-avatars/123456789012345678/0123456789abcdef0123456789abcdef')
      .expect(200)
      .expect('Content-Type', 'image/png')
      .expect('Cache-Control', 'public, max-age=3600');
    expect(result.body).toStrictEqual(Buffer.from([137, 80, 78, 71]));
    expect(result.headers['set-cookie']).toBe(undefined);
    expect(fetchImage.mock.calls.length).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('readiness reports database outages as 503', async () => {
  const offline = createApp({
    repository: repository(),
    corsOrigin: 'http://localhost:5173',
    checkDatabase: async () => {
      throw new Error('secret connection');
    }
  });
  await request(offline).get('/health/live').expect(200);
  const result = await request(offline).get('/health/ready').expect(503);
  expect(result.body.error.code).toBe('DATABASE_UNAVAILABLE');
  expect(!result.text.includes('secret')).toBeTruthy();
});
test('public season and division endpoints', async () => {
  const result = await request(app).get('/api/v1/seasons').expect(200);
  expect(result.body.data[0].id).toBe(seasonId);
  await request(app).get(`/api/v1/seasons/${seasonId}/divisions`).expect(200);
  await request(app).get(`/api/v1/divisions/${divisionId}/teams`).expect(200);
});
test('validation, missing resources and unsupported routes use stable errors', async () => {
  await request(app).get('/api/v1/divisions/not-a-uuid/teams').expect(422);
  await request(app).get(`/api/v1/divisions/${homeId}/teams`).expect(404);
  const disabledAdmin = await request(app).get('/api/v1/crud-operations/matches').expect(503);
  expect(disabledAdmin.body.error.code).toBe('CRUD_OPERATIONS_NOT_CONFIGURED');
  await request(app).get(`/api/v1/divisions/${divisionId}/calendar?roundId=99`).expect(404);
  const unexpectedRes = await request(app)
    .get(`/api/v1/divisions/${divisionId}/calendar?unexpected=1`)
    .expect(422);
  expect(unexpectedRes.body.error.code).toBe('VALIDATION_ERROR');
  expect(
    unexpectedRes.body.error.details.formErrors.includes(
      "Unrecognized key(s) in object: 'unexpected'"
    )
  ).toBeTruthy();
  expect(unexpectedRes.body.error.details.fieldErrors).toStrictEqual({});
});
test('malformed JSON and unexpected failures do not leak internals', async () => {
  await request(app).post('/unknown').set('content-type', 'application/json').send('{').expect(400);
  const failing = createApp({
    repository: {
      ...repository(),
      seasons: async () => {
        throw new Error('password=secret');
      }
    },
    corsOrigin: 'http://localhost:5173',
    checkDatabase: async () => {}
  });
  const result = await request(failing).get('/api/v1/seasons').expect(500);
  expect(!result.text.includes('secret')).toBeTruthy();
});
test('regular standings exclude playoffs and unfinished matches', async () => {
  const rows = await new CompetitionService(repository()).standings(divisionId);
  expect(rows[0]?.team.id).toBe(homeId);
  expect(rows[0]?.wins).toBe(1);
  expect(rows[0]?.played).toBe(1);
  expect(rows[1]?.losses).toBe(1);
  const playoffs = await new CompetitionService(repository()).standings(divisionId, 'playoffs');
  expect(playoffs[0]?.team.id).toBe(awayId);
});

test('regular BO3 standings award the score difference for all four results', async () => {
  for (const [homeScore, awayScore, difference] of [
    [2, 0, 2],
    [2, 1, 1],
    [0, 2, -2],
    [1, 2, -1]
  ] as const) {
    const source = repository();
    const otherMatches = (await source.matches(divisionId)).slice(1);
    source.matches = async () => [
      {
        ...match,
        bestOf: 3,
        homeScore,
        awayScore,
        winnerTeamId: homeScore === 2 ? homeId : awayId
      },
      ...otherMatches
    ];
    const rows = await new CompetitionService(source).standings(divisionId);
    const home = rows.find((row) => row.team.id === homeId);
    const away = rows.find((row) => row.team.id === awayId);
    expect(home?.mapDifference).toBe(difference);
    expect(away?.mapDifference).toBe(-difference);
    expect(home?.played).toBe(1);
    expect(away?.played).toBe(1);
    expect(home?.wins).toBe(Number(homeScore === 2));
    expect(home?.losses).toBe(Number(awayScore === 2));
  }
});
test('standings prioritize series wins over accumulated map difference', async () => {
  const source = repository();
  source.matches = async () => [
    { ...match, id: 'series-1', bestOf: 3, homeScore: 2, awayScore: 0 },
    { ...match, id: 'series-2', bestOf: 3, homeScore: 2, awayScore: 0 },
    ...['series-3', 'series-4', 'series-5'].map((id) => ({
      ...match,
      id,
      bestOf: 3,
      homeScore: 1,
      awayScore: 2,
      winnerTeamId: awayId
    }))
  ];
  const rows = await new CompetitionService(source).standings(divisionId);
  expect(rows[0]?.team.id).toBe(awayId);
  expect(rows[0]?.mapDifference).toBe(-1);
  expect(rows[0]?.wins).toBe(3);
  expect(rows[0]?.played).toBe(5);
  expect(rows[1]?.mapDifference).toBe(1);
  expect(rows[1]?.wins).toBe(2);
});

test('standings break equal series wins by map difference before team name', async () => {
  const source = repository();
  source.matches = async () => [
    { ...match, bestOf: 3, homeScore: 2, awayScore: 1 },
    { ...match, id: 'series-2', bestOf: 3, homeScore: 0, awayScore: 2, winnerTeamId: awayId }
  ];
  const rows = await new CompetitionService(source).standings(divisionId);
  expect(
    rows.map(({ team, position, wins, mapDifference }) => ({
      id: team.id,
      position,
      wins,
      mapDifference
    }))
  ).toStrictEqual([
    { id: awayId, position: 1, wins: 1, mapDifference: 1 },
    { id: homeId, position: 2, wins: 1, mapDifference: -1 }
  ]);
});

test('calendar filters by round and expands teams', async () => {
  const result = await request(app)
    .get(`/api/v1/divisions/${divisionId}/calendar?roundId=${roundId}`)
    .expect(200);
  expect(result.body.data.length).toBe(2);
  expect(result.body.data[0].homeTeam.name).toBe('A');
});

test('roster statistics count distinct champions in completed team games', async () => {
  const source = repository();
  source.teamDetail = async () => ({
    id: homeId,
    divisionId,
    name: 'A',
    shortName: null,
    logoUrl: null,
    color: null,
    isActive: true,
    seasonName: 'T1',
    divisionName: 'Premier',
    members: [
      {
        id: 'member',
        playerId: homeId,
        name: 'Jugador',
        role: 'mid',
        isCaptain: true,
        gameName: 'Jugador',
        riotTag: 'EUW',
        countryCode: 'es'
      }
    ]
  });
  source.matches = async () => [match];
  const games: Awaited<ReturnType<CompetitionRepository['matchGames']>> = [
    'Ahri',
    'Ahri',
    'Orianna'
  ].map((champion, index) => ({
    id: `game-${index}`,
    gameNumber: index + 1,
    blueTeamId: homeId,
    redTeamId: awayId,
    winnerTeamId: homeId,
    durationSeconds: 1800,
    participants: [
      {
        id: `participant-${index}`,
        playerId: homeId,
        gameName: 'Jugador',
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
  }));
  source.matchGamesByMatch = async (ids) => new Map(ids.map((id) => [id, games]));
  const detail = await new CompetitionService(source).teamDetail(homeId);
  expect(detail.members[0]?.rosterStats?.games).toBe(3);
  expect(detail.members[0]?.rosterStats?.champions).toBe(2);
});
