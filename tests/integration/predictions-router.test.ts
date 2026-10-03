import request from 'supertest';
import { expect, test, vi } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import type { CompetitionRepository } from '../../apps/api/src/modules/competition/competition.repository.js';
import type { PredictionsRepository } from '../../apps/api/src/modules/predictions/predictions.repository.js';

const divisionId = '20000000-0000-4000-8000-000000000001';

test('the round query is validated strictly and forwarded to the overview', async () => {
  const overview = vi.fn().mockResolvedValue({
    week: '2026-10-05',
    round: '3',
    currentRound: '3',
    open: false,
    matches: [],
    ranking: []
  });
  const app = createApp({
    repository: {} as CompetitionRepository,
    predictionsRepository: { overview } as unknown as PredictionsRepository,
    checkDatabase: async () => {},
    corsOrigin: 'http://localhost:5173'
  });
  const path = `/api/v1/predictions/divisions/${divisionId}`;

  await request(app).get(`${path}?roundId=3`).expect(200);
  expect(overview).toHaveBeenLastCalledWith(divisionId, { roundId: 3 });
  await request(app).get(path).expect(200);
  expect(overview).toHaveBeenLastCalledWith(divisionId, {});

  for (const query of [
    'roundId=abc',
    'roundId=40000',
    'roundId=1.5',
    'roundId=1&roundId=2',
    'foo=1'
  ]) {
    const response = await request(app).get(`${path}?${query}`).expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  }
  expect(overview).toHaveBeenCalledTimes(2);
});
