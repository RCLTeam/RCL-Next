import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
test('Game catalog maps items, spells and rune paths and tolerates partial catalog failures', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const data = url.endsWith('versions.json')
        ? ['16.1.1']
        : url.endsWith('item.json')
          ? { data: { '1001': { name: 'Botas', image: { full: '1001.png' } } } }
          : url.endsWith('summoner.json')
            ? {
                data: {
                  summonerFlash: {
                    name: 'Destello',
                    key: '4',
                    image: { full: 'SummonerFlash.png' }
                  }
                }
              }
            : url.endsWith('runesReforged.json')
              ? [
                  {
                    id: 8000,
                    name: 'Precisión',
                    icon: 'perk-images/Styles/7201_Precision.png',
                    slots: [
                      {
                        runes: [
                          {
                            id: 8010,
                            name: 'Conquistador',
                            icon: 'perk-images/Styles/Precision/Conqueror/Conqueror.png'
                          }
                        ]
                      }
                    ]
                  }
                ]
              : null;
      return { ok: data !== null, json: async () => data };
    })
  );
  const { loadGameCatalog } = await import('./data-dragon.service.js');
  const catalog = await loadGameCatalog();
  expect(catalog['item:1001']?.name).toBe('Botas');
  expect(catalog['summoner:4']?.image).toContain('/img/spell/SummonerFlash.png');
  expect(catalog['rune:8010']?.name).toBe('Conquistador');
  expect(catalog['rune:8000']?.name).toBe('Precisión');
});

function catalogResponse(url: string) {
  const data = url.endsWith('versions.json')
    ? ['16.1.1']
    : url.endsWith('runesReforged.json')
      ? []
      : { data: {} };
  return { ok: true, json: async () => data };
}

test('Concurrent and subsequent consumers share one catalog request', async () => {
  const fetch = vi.fn(async (url: string) => catalogResponse(url));
  vi.stubGlobal('fetch', fetch);
  const { loadGameCatalog } = await import('./data-dragon.service.js');
  const first = loadGameCatalog();
  const second = loadGameCatalog();
  expect(second).toBe(first);
  const catalog = await first;
  expect(await loadGameCatalog()).toBe(catalog);
  expect(fetch).toHaveBeenCalledTimes(5);
});

test('A failed version request can be retried by the next consumer', async () => {
  const fetch = vi.fn(async (url: string) => catalogResponse(url));
  fetch.mockRejectedValueOnce(new Error('Network unavailable'));
  vi.stubGlobal('fetch', fetch);
  const { loadGameCatalog } = await import('./data-dragon.service.js');
  await expect(loadGameCatalog()).rejects.toThrow('Network unavailable');
  await expect(loadGameCatalog()).resolves.toHaveProperty('rune:5001');
  expect(fetch).toHaveBeenCalledTimes(6);
});

test('Partial catalogs remain usable without caching missing assets permanently', async () => {
  let failItems = true;
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('item.json')) {
      return {
        ok: !failItems,
        json: async () => ({ data: { '1001': { name: 'Boots', image: { full: '1001.png' } } } })
      };
    }
    return catalogResponse(url);
  });
  vi.stubGlobal('fetch', fetch);
  const { loadGameCatalog } = await import('./data-dragon.service.js');
  expect((await loadGameCatalog())['item:1001']).toBeUndefined();
  failItems = false;
  const complete = await loadGameCatalog();
  expect(complete['item:1001']?.name).toBe('Boots');
  expect(await loadGameCatalog()).toBe(complete);
  expect(fetch).toHaveBeenCalledTimes(10);
});

test('Invalid versions are rejected before constructing asset URLs', async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ['invalid/version'] }));
  vi.stubGlobal('fetch', fetch);
  const { loadGameCatalog } = await import('./data-dragon.service.js');
  await expect(loadGameCatalog()).rejects.toThrow('Invalid version');
  expect(fetch).toHaveBeenCalledTimes(1);
});
