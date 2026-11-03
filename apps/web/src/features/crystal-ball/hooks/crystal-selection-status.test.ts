import { expect, test } from 'vitest';
import { crystalSelectionStatus } from './crystal-selection-status.js';

test('distinguishes loading, failure and empty leagues from a usable selection', () => {
  const base: Parameters<typeof crystalSelectionStatus>[0] = {
    season: { id: 's', name: 'S' },
    seasons: { status: 'ready', data: [] },
    division: undefined,
    divisions: { status: 'loading', data: [] }
  };
  expect(crystalSelectionStatus(base)).toBe('Cargando ligas…');
  expect(crystalSelectionStatus({ ...base, divisions: { status: 'error', data: [] } })).toBe(
    'No se pudieron cargar las ligas.'
  );
  expect(crystalSelectionStatus({ ...base, divisions: { status: 'ready', data: [] } })).toBe(
    'Esta temporada no tiene ligas.'
  );
  expect(crystalSelectionStatus({ ...base, season: undefined })).toBe(
    'No hay temporadas disponibles.'
  );
  expect(
    crystalSelectionStatus({ ...base, season: undefined, seasons: { status: 'error', data: [] } })
  ).toBe('No se pudieron cargar las temporadas.');
  expect(
    crystalSelectionStatus({
      ...base,
      division: { id: 'd', seasonId: 's', code: 'P', name: 'Premier', sortOrder: 1 },
      divisions: { status: 'ready', data: [] }
    })
  ).toBeNull();
});
