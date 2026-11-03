import type React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, onTestFinished, vi } from 'vitest';
export function setupCrystalRender() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  onTestFinished(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  return {
    container,
    async render(node: React.ReactNode) {
      await act(async () => root.render(node));
    },
    async click(text: string) {
      const button = [...container.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text
      );
      expect(button, `Button ${text}`).toBeTruthy();
      expect(button?.disabled).toBe(false);
      await act(async () => button?.click());
    }
  };
}
