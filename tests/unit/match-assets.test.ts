import { afterEach, expect, test, vi } from 'vitest';
import { loadGameCatalog } from '../../apps/web/src/site/pages/calendar/match-assets.js';
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
  const catalog = await loadGameCatalog();
  expect(catalog['item:1001']?.name).toBe('Botas');
  expect(catalog['summoner:4']?.image).toContain('/img/spell/SummonerFlash.png');
  expect(catalog['rune:8010']?.name).toBe('Conquistador');
  expect(catalog['rune:8000']?.name).toBe('Precisión');
});
