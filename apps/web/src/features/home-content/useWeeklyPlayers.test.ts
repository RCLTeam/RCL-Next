import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWeeklyPlayers } from './useWeeklyPlayers.js';

afterEach(() => vi.unstubAllGlobals());
describe('weekly player selection from division rosters', () => {
  it('loads only the selected division and includes substitutes but excludes non-playing staff', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'team-a', name: 'Alpha' }] }))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            id: 'team-a',
            name: 'Alpha',
            members: [
              { id: 'person-1', gameName: 'Player', name: 'Display', riotTag: 'EUW', role: 'top' },
              {
                id: 'person-2',
                gameName: null,
                name: 'Substitute',
                riotTag: null,
                role: 'substitute'
              },
              { id: 'person-3', gameName: 'Coach', name: 'Coach', role: 'coach' }
            ]
          }
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await loadWeeklyPlayers('division-a', signal)).toEqual([
      {
        id: 'team-a:person-1',
        memberId: 'person-1',
        name: 'Player',
        team: 'Alpha',
        tag: 'EUW',
        role: 'top'
      },
      {
        id: 'team-a:person-2',
        memberId: 'person-2',
        name: 'Substitute',
        team: 'Alpha',
        tag: null,
        role: 'substitute'
      }
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/divisions/division-a/teams', {
      signal,
      credentials: 'include'
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/teams/team-a', {
      signal,
      credentials: 'include'
    });
  });
  it('returns an empty selection for a division without teams', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: [] })));
    expect(await loadWeeklyPlayers('empty', new AbortController().signal)).toEqual([]);
  });
  it('reports failed roster loads instead of silently offering an incomplete selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ data: [{ id: 'team-a' }] }))
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
    );
    await expect(loadWeeklyPlayers('division-a', new AbortController().signal)).rejects.toThrow();
  });
});
