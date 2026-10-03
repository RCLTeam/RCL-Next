import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { RoundFilter } from '../competition/components/RoundFilter.js';
import type { Round } from '../competition/types/competition.types.js';
import { selectableRounds } from './selectable-rounds.js';

const round = (id: number, startsAt: string | null): Round => ({
  id: String(id),
  sequence: id,
  stage: 'regular',
  name: `Jornada ${id}`,
  startsAt
});
const rounds = [
  round(6, '2026-10-04T22:00:00Z'),
  round(4, '2026-09-06T22:00:00Z'),
  round(5, '2026-09-27T22:00:00Z'),
  round(7, null)
];

test('only the current round and earlier ones are selectable, oldest first', () => {
  expect(selectableRounds(rounds, '5').map((r) => r.id)).toEqual(['4', '5']);
  expect(selectableRounds(rounds, '6').map((r) => r.id)).toEqual(['4', '5', '6']);
  for (const current of [null, '99', '7']) expect(selectableRounds(rounds, current)).toEqual([]);
});

test('the round filter never offers a future round', () => {
  const html = renderToStaticMarkup(
    <RoundFilter rounds={selectableRounds(rounds, '5')} value="5" onChange={() => {}} />
  );
  expect(html).toContain('Jornada 4');
  expect(html).toContain('Jornada 5');
  expect(html).not.toContain('Jornada 6');
  expect(html).not.toContain('Jornada 7');
});
