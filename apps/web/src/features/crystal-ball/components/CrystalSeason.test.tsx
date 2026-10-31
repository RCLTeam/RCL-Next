// @vitest-environment jsdom
import type { CrystalBallData } from '@rcl/contracts';
import React from 'react';
import { expect, test, vi } from 'vitest';
import { useGameCatalogState } from '../../../shared/riot/useGameCatalog.js';
import { useEditorLeaveGuard } from '../../home-content/useEditorLeaveGuard.js';
import { setupCrystalRender } from '../crystal-test-utils.js';
import { useCrystalBall } from '../hooks/useCrystalBall.js';
import { CrystalSeason } from './CrystalSeason.js';
vi.mock('../hooks/useCrystalBall.js');
vi.mock('../../../shared/riot/useGameCatalog.js');
vi.mock('../../home-content/useEditorLeaveGuard.js');
vi.mock('./CrystalFields.js', () => ({
  // biome-ignore lint/style/useNamingConvention: React component export in a module mock.
  CrystalFields: ({ onChange }: { onChange: (answers: Record<string, string[]>) => void }) => (
    <button type="button" onClick={() => onChange({ q: ['a'] })}>
      Pick
    </button>
  )
}));
const data: CrystalBallData = {
  season: 'S',
  divisionId: 'd',
  opensAt: null,
  closesAt: null,
  status: 'open',
  results: {},
  ranking: [],
  questions: [
    {
      id: 'q',
      label: 'Q',
      category: 'qualification',
      mode: 'manual',
      kind: 'team',
      count: 1,
      options: [{ id: 'a', name: 'A' }]
    }
  ]
};
function model() {
  const save = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useCrystalBall).mockReturnValue({
    data,
    answers: {},
    error: '',
    retry: vi.fn(),
    save,
    configure: vi.fn(),
    resolve: vi.fn()
  });
  return save;
}
test('initial catalog loading is not reported as an error', async () => {
  model();
  vi.mocked(useGameCatalogState).mockReturnValue({ catalog: {}, status: 'loading' });
  const view = setupCrystalRender();
  await view.render(<CrystalSeason season="S" divisionId="d" userId="u" />);
  expect(view.container.textContent).toContain('Cargando campeones');
  expect(view.container.textContent).not.toContain('no esta disponible');
  vi.mocked(useGameCatalogState).mockReturnValue({ catalog: {}, status: 'error' });
  await view.render(<CrystalSeason season="S" divisionId="d" userId="u" />);
  expect(view.container.textContent).toContain('no esta disponible');
});
test('edits activate the leave guard, saving clears it and changing context resets the ballot', async () => {
  const save = model();
  vi.mocked(useGameCatalogState).mockReturnValue({ catalog: {}, status: 'ready' });
  const view = setupCrystalRender();
  await view.render(<CrystalSeason season="S" divisionId="d" userId="u" />);
  await view.click('Pick');
  expect(useEditorLeaveGuard).toHaveBeenLastCalledWith(true, false);
  await view.click('Guardar mi bola de cristal →');
  expect(save).toHaveBeenCalledWith({ q: ['a'] });
  expect(useEditorLeaveGuard).toHaveBeenLastCalledWith(false, false);
  await view.click('Pick');
  await view.render(<CrystalSeason season="S" divisionId="other" userId="u" />);
  expect(view.container.querySelector('progress')?.value).toBe(0);
  expect(useEditorLeaveGuard).toHaveBeenLastCalledWith(false, false);
});
