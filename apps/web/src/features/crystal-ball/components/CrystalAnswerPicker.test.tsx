// @vitest-environment jsdom
import type { CrystalAnswers, CrystalQuestion } from '@rcl/contracts';
import type React from 'react';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { setupCrystalRender } from '../crystal-test-utils.js';
import { CrystalFields } from './CrystalFields.js';
vi.mock('../../../shared/components/Modal/Modal.js', () => ({
  // biome-ignore lint/style/useNamingConvention: React component export in a module mock.
  Modal: ({ children }: { children: React.ReactNode }) => <dialog open>{children}</dialog>
}));
const options = Array.from({ length: 6 }, (_, i) => ({
  id: String(i),
  name: `Team ${i}`,
  shortName: `T${i}`
}));
const questions: CrystalQuestion[] = [
  {
    id: 'winner:d',
    label: 'Winner',
    category: 'qualification',
    kind: 'team',
    mode: 'manual',
    count: 4,
    options
  },
  {
    id: 'loser:d',
    label: 'Loser',
    category: 'qualification',
    kind: 'team',
    mode: 'manual',
    count: 2,
    options
  }
];
function Ballot() {
  const [answers, setAnswers] = useState<CrystalAnswers>({
    'winner:d': ['0', '1', '2', '3'],
    'loser:d': ['4', '5']
  });
  return (
    <>
      <CrystalFields
        questions={questions}
        answers={answers}
        onChange={setAnswers}
        disabled={false}
      />
      <output data-testid="answers">{JSON.stringify(answers)}</output>
    </>
  );
}
test('clearing a public bracket commits an empty answer and permits swapping teams across full brackets', async () => {
  const view = setupCrystalRender();
  await view.render(<Ballot />);
  await view.click('Cambiar: Winner');
  await view.click('Limpiar');
  await view.click('Confirmar seleccion');
  expect(view.container.querySelector('[data-testid="answers"]')?.textContent).not.toContain(
    'winner:d'
  );
  await view.click('Cambiar: Loser');
  await view.click('Limpiar');
  await view.click('T0');
  await view.click('T5');
  await view.click('Confirmar seleccion');
  await view.click('Elegir: Winner');
  for (const name of ['T1', 'T2', 'T3', 'T4']) await view.click(name);
  await view.click('Confirmar seleccion');
  expect(
    JSON.parse(view.container.querySelector('[data-testid="answers"]')?.textContent ?? '{}')
  ).toEqual({ 'winner:d': ['1', '2', '3', '4'], 'loser:d': ['0', '5'] });
});
test('partial brackets remain unconfirmable and cancelling never mutates the ballot', async () => {
  const view = setupCrystalRender();
  await view.render(<Ballot />);
  await view.click('Cambiar: Winner');
  await view.click('Limpiar');
  await view.click('T0');
  const confirm = [...view.container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Confirmar seleccion'
  );
  expect(confirm?.disabled).toBe(true);
  expect(view.container.querySelector('[data-testid="answers"]')?.textContent).toContain(
    '"winner:d":["0","1","2","3"]'
  );
});
