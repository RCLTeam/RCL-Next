// @vitest-environment jsdom
import type { CrystalBallData } from '@rcl/contracts';
import type React from 'react';
import { expect, test, vi } from 'vitest';
import { setupCrystalRender } from '../crystal-test-utils.js';
import { CrystalAdmin } from './CrystalAdmin.js';
vi.mock('../../../shared/riot/useGameCatalog.js', () => ({
  useGameCatalogState: () => ({ catalog: {}, status: 'loading' })
}));
vi.mock('../../home-content/useEditorLeaveGuard.js', () => ({ useEditorLeaveGuard: vi.fn() }));
vi.mock('../../../shared/components/Modal/Modal.js', () => ({
  // biome-ignore lint/style/useNamingConvention: React component export in a module mock.
  Modal: ({ children }: { children: React.ReactNode }) => <dialog open>{children}</dialog>
}));
const data: CrystalBallData = {
  season: 'S',
  divisionId: 'd',
  opensAt: '2050-01-01T00:00:00Z',
  closesAt: '2050-02-01T00:00:00Z',
  status: 'closed',
  results: {},
  ranking: [],
  questions: [
    {
      id: 'surprise-team',
      label: 'Revelacion',
      kind: 'team',
      category: 'classification',
      mode: 'manual',
      count: 1,
      options: [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' }
      ]
    }
  ]
};
test('polling refreshes untouched dates and manual answers before automatic calculation', async () => {
  const view = setupCrystalRender();
  const resolve = vi.fn().mockResolvedValue(undefined);
  const props = { configure: vi.fn(), resolve, onDirty: vi.fn(), onBusy: vi.fn() };
  await view.render(<CrystalAdmin {...props} data={data} />);
  await view.render(
    <CrystalAdmin
      {...props}
      data={{ ...data, opensAt: '2050-01-10T00:00:00Z', results: { 'surprise-team': ['b'] } }}
    />
  );
  expect(view.container.querySelector('input')?.value).toContain('2050-01-10');
  await view.click('Calcular resultados automaticos');
  expect(resolve).toHaveBeenCalledWith({ 'surprise-team': ['b'] }, true);
});
test('polling does not overwrite an edited result draft', async () => {
  const view = setupCrystalRender();
  const resolve = vi.fn().mockResolvedValue(undefined);
  const props = { configure: vi.fn(), resolve, onDirty: vi.fn(), onBusy: vi.fn() };
  await view.render(<CrystalAdmin {...props} data={data} />);
  await view.click('Elegir: Revelacion');
  await view.click('Alpha');
  await view.click('Confirmar seleccion');
  await view.render(
    <CrystalAdmin {...props} data={{ ...data, results: { 'surprise-team': ['b'] } }} />
  );
  await view.click('Publicar resultados manuales');
  expect(resolve).toHaveBeenCalledWith({ 'surprise-team': ['a'] }, false);
});
test('missing automatic questions become editable only after calculation', async () => {
  const view = setupCrystalRender();
  const props = { configure: vi.fn(), resolve: vi.fn(), onDirty: vi.fn(), onBusy: vi.fn() };
  const automatic: CrystalBallData = {
    ...data,
    questions: [
      {
        id: 'pentakills',
        label: 'Pentakills',
        kind: 'choice',
        category: 'meta',
        mode: 'automatic',
        count: 1,
        options: [{ id: '0', name: '0' }]
      }
    ]
  };
  await view.render(<CrystalAdmin {...props} data={automatic} />);
  expect(view.container.querySelector('fieldset')).toBeNull();
  await view.render(
    <CrystalAdmin
      {...props}
      data={{ ...automatic, calculatedAt: '2050-02-02T00:00:00Z', automaticResults: {} }}
    />
  );
  expect(view.container.querySelector('legend')?.textContent).toBe('Pentakills');
});
