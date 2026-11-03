// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, onTestFinished, test, vi } from 'vitest';
import { Select } from './Selector.js';

test.each([
  { desktop: false, popover: true, custom: false },
  { desktop: true, popover: false, custom: false },
  { desktop: true, popover: true, custom: true }
])(
  'select interaction with $desktop desktop and $popover popover support',
  async ({ desktop, popover, custom }) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: desktop }))
    );
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    onTestFinished(async () => {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    });
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <Select defaultValue="a" onChange={onChange}>
          <option value="a">Alpha</option>
          <option value="b">Beta</option>
        </Select>
      );
    });
    const select = container.querySelector('select');
    const popup = container.querySelector('dialog');
    if (!select || !popup) throw new Error('Missing select controls');
    const show = vi.fn();
    if (popover) {
      popup.showPopover = show;
      popup.hidePopover = vi.fn();
    }
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => {
      select.dispatchEvent(down);
      select.dispatchEvent(click);
    });
    expect(down.defaultPrevented).toBe(custom);
    expect(click.defaultPrevented).toBe(custom);
    expect(show).toHaveBeenCalledTimes(custom ? 1 : 0);
    if (custom) {
      const option = container.querySelectorAll('[role="option"]')[1];
      if (!option) throw new Error('Missing second option');
      await act(async () => {
        option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    } else {
      const key = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true
      });
      await act(async () => {
        select.dispatchEvent(key);
        select.value = 'b';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(key.defaultPrevented).toBe(false);
    }
    expect(select.value).toBe('b');
    expect(onChange).toHaveBeenCalledTimes(1);
  }
);
