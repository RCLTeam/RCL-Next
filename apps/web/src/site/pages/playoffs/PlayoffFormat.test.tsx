// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, onTestFinished, test, vi } from 'vitest';
import { PlayoffFormat } from './PlayoffFormat.js';

test('scales with available container width and releases its resize observer', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let width = 1500;
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe(element: HTMLElement) {
        Object.defineProperty(element, 'clientWidth', { configurable: true, get: () => width });
        resize();
      }
      disconnect = disconnect;
    }
  );
  const container = document.createElement('div');
  const root = createRoot(container);
  onTestFinished(async () => {
    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  await act(async () => root.render(<PlayoffFormat matches={[]} standings={[]} />));
  const map = container.querySelector<HTMLElement>('.playoff-map');
  expect(Number(map?.style.zoom)).toBeCloseTo(1500 / 1240);
  for (const [nextWidth, expected] of [
    [320, 1],
    [768, 1],
    [1240, 1],
    [1860, 1.5],
    [2400, 1.5]
  ]) {
    if (nextWidth === undefined) throw new Error('Missing width');
    width = nextWidth;
    await act(async () => resize());
    expect(Number(map?.style.zoom)).toBe(expected);
  }
});
