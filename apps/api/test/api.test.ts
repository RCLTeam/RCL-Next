import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type {
  CompetitionRepository,
  Match,
  Team
} from '../src/modules/competition/competition.repository.js';
import { CompetitionService } from '../src/modules/competition/competition.service.js';

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
  isActive: true
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
  streamUrl: null
};
function repository(): CompetitionRepository {
  const season = { id: seasonId, name: 'Demo', startsOn: null, endsOn: null, isActive: false };
  const division = { id: divisionId, seasonId, code: 'premier', name: 'Premier', sortOrder: 1 };
  return {
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
  assert.equal(result.body.error.code, 'DATABASE_UNAVAILABLE');
  assert.ok(!result.text.includes('secret'));
});
test('public season and division endpoints', async () => {
  const result = await request(app).get('/api/v1/seasons').expect(200);
  assert.equal(result.body.data[0].id, seasonId);
  await request(app).get(`/api/v1/seasons/${seasonId}/divisions`).expect(200);
  await request(app).get(`/api/v1/divisions/${divisionId}/teams`).expect(200);
});
test('validation, missing resources and unsupported routes use stable errors', async () => {
  await request(app).get('/api/v1/divisions/not-a-uuid/teams').expect(422);
  await request(app).get(`/api/v1/divisions/${homeId}/teams`).expect(404);
  await request(app).get('/api/v1/admin/matches').expect(404);
  await request(app).get(`/api/v1/divisions/${divisionId}/calendar?roundId=99`).expect(404);
  await request(app).get(`/api/v1/divisions/${divisionId}/calendar?unexpected=1`).expect(422);
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
  assert.ok(!result.text.includes('secret'));
});
test('regular standings exclude playoffs and unfinished matches', async () => {
  const rows = await new CompetitionService(repository()).standings(divisionId);
  assert.equal(rows[0]?.team.id, homeId);
  assert.equal(rows[0]?.wins, 1);
  assert.equal(rows[0]?.played, 1);
  assert.equal(rows[1]?.losses, 1);
  const playoffs = await new CompetitionService(repository()).standings(divisionId, 'playoffs');
  assert.equal(playoffs[0]?.team.id, awayId);
});
test('calendar filters by round and expands teams', async () => {
  const result = await request(app)
    .get(`/api/v1/divisions/${divisionId}/calendar?roundId=${roundId}`)
    .expect(200);
  assert.equal(result.body.data.length, 2);
  assert.equal(result.body.data[0].homeTeam.name, 'A');
});
