// @vitest-environment jsdom
import React, { act } from 'react';
import { expect, test, vi } from 'vitest';
import { setupCrystalRender } from '../crystal-test-utils.js';
import { useCrystalBall } from './useCrystalBall.js';
function Probe({ division, user }: { division: string; user: string }) {
  const state = useCrystalBall('S', division, user);
  return <output>{JSON.stringify({ data: state.data, answers: state.answers })}</output>;
}
test('changing league or user hides the previous ballot and ignores late responses', async () => {
  const view = setupCrystalRender();
  const pending: { url: string; resolve: (r: Response) => void }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => new Promise<Response>((resolve) => pending.push({ url, resolve })))
  );
  await view.render(<Probe division="a" user="u" />);
  await act(async () => {
    pending[0]?.resolve(
      new Response(JSON.stringify({ data: { divisionId: 'a', status: 'open' } }))
    );
    pending[1]?.resolve(new Response(JSON.stringify({ data: { q: ['a'] } })));
  });
  expect(view.container.textContent).toContain('"q":["a"]');
  await view.render(<Probe division="b" user="u" />);
  expect(view.container.textContent).toContain('"data":null');
  await view.render(<Probe division="b" user="v" />);
  await act(async () => {
    pending[2]?.resolve(
      new Response(JSON.stringify({ data: { divisionId: 'b', status: 'open' } }))
    );
    pending[3]?.resolve(new Response(JSON.stringify({ data: { q: ['stale'] } })));
  });
  expect(view.container.textContent).not.toContain('stale');
  expect(view.container.textContent).toContain('"data":null');
  await act(async () => {
    pending[4]?.resolve(
      new Response(JSON.stringify({ data: { divisionId: 'b', status: 'open' } }))
    );
    pending[5]?.resolve(new Response(JSON.stringify({ data: { q: ['fresh'] } })));
  });
  expect(view.container.textContent).toContain('fresh');
});
