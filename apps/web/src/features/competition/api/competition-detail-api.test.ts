import { afterEach, expect, test, vi } from 'vitest';
import { getCompetitionDetail } from './competition-detail-api.js';

afterEach(() => vi.unstubAllGlobals());

test('Detail requests preserve encoded slugs, session credentials and cancellation', async () => {
  const data = { id: 'team', members: [] };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data })));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  expect(await getCompetitionDetail('teams', 'equipo%20uno', controller.signal)).toEqual(data);
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/teams/equipo%20uno', {
    signal: controller.signal,
    credentials: 'include'
  });
});

test.each([404, 422])(
  'Missing or invalid identifiers remain missing states (%s)',
  async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    expect(
      await getCompetitionDetail('players', 'missing', new AbortController().signal)
    ).toBeNull();
  }
);

test('Server failures and invalid detail bodies remain errors', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  for (const response of [
    new Response(null, { status: 500 }),
    new Response('null'),
    new Response(JSON.stringify({ data: { games: null } })),
    new Response(JSON.stringify({ data: { members: [] } }))
  ]) {
    fetchMock.mockResolvedValueOnce(response);
    await expect(
      getCompetitionDetail('matches', 'match', new AbortController().signal)
    ).rejects.toThrow();
  }
});

test('Each detail endpoint validates its own collection', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  for (const [resource, collection] of [
    ['teams', 'members'],
    ['players', 'teams'],
    ['matches', 'games']
  ] as const) {
    const data = { [collection]: [] };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data })));
    expect(await getCompetitionDetail(resource, 'id', new AbortController().signal)).toEqual(data);
  }
});
