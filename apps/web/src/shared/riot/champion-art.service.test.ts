import { beforeEach, expect, onTestFinished, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
});

test('Shares requests and resolves base and future skins from client metadata', async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      skins: [
        {
          id: 103000,
          name: 'Ahri',
          isBase: true,
          splashPath: '/lol-game-data/assets/ASSETS/Characters/Ahri/Base.jpg',
          loadScreenPath: '/lol-game-data/assets/ASSETS/Characters/Ahri/Load.jpg'
        },
        {
          id: 103999,
          name: 'Future skin',
          isBase: false,
          splashPath: '/lol-game-data/assets/ASSETS/Characters/Ahri/New.jpg',
          tilePath: 'https://unexpected.example/image.jpg'
        }
      ]
    })
  }));
  vi.stubGlobal('fetch', fetch);
  const { loadChampionArt, selectChampionArt } = await import('./champion-art.service.js');
  const first = loadChampionArt(103);
  expect(loadChampionArt(103)).toBe(first);
  const skins = await first;
  expect(selectChampionArt(skins)?.portrait).toContain('/assets/characters/ahri/load.jpg');
  expect(selectChampionArt(skins, 103999)?.centered).toContain('/assets/characters/ahri/new.jpg');
  expect(selectChampionArt(skins, 103999)?.tile).toBeUndefined();
  expect(selectChampionArt(skins, 999)?.isBase).toBe(true);
  expect(await loadChampionArt(103)).toBe(skins);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('Failed requests can retry and invalid IDs never fetch', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ skins: [] })
    });
  vi.stubGlobal('fetch', fetch);
  const { loadChampionArt } = await import('./champion-art.service.js');
  await expect(loadChampionArt(103)).rejects.toThrow();
  await expect(loadChampionArt(103)).resolves.toEqual([]);
  await expect(loadChampionArt(Number.NaN)).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([null, 1, 'invalid', {}, { skins: null }])(
  'Rejects malformed champion metadata: %j',
  async (data) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => data }))
    );
    const { loadChampionArt } = await import('./champion-art.service.js');
    await expect(loadChampionArt(103)).rejects.toThrow('Invalid champion art');
  }
);

test('Ignores null, primitive and malformed skin entries', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        skins: [null, 1, 'skin', {}, { id: 103000, name: 'Ahri', isBase: true }]
      })
    }))
  );
  const { loadChampionArt } = await import('./champion-art.service.js');
  expect(await loadChampionArt(103)).toEqual([expect.objectContaining({ id: 103000 })]);
});
