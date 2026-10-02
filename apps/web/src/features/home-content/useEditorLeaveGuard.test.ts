import { afterEach, expect, test, vi } from 'vitest';
import { editorLeaveHandlers } from './useEditorLeaveGuard.js';

afterEach(() => vi.unstubAllGlobals());

test('dirty editors respect both answers to the discard confirmation', () => {
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal('window', { confirm });
  const guard = editorLeaveHandlers(true, false);
  expect(guard.canLeave()).toBe(false);
  confirm.mockReturnValue(true);
  expect(guard.canLeave()).toBe(true);
  expect(confirm).toHaveBeenCalledTimes(2);
});

test('clean editors leave without prompting and in-flight writes block internal navigation', () => {
  const confirm = vi.fn();
  vi.stubGlobal('window', { confirm });
  expect(editorLeaveHandlers(false, false).canLeave()).toBe(true);
  expect(editorLeaveHandlers(true, true).canLeave()).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
});

test('reload and closing the document prompt only for pending edits or uploads', () => {
  for (const [dirty, busy] of [
    [true, false],
    [false, true],
    [false, false]
  ]) {
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    editorLeaveHandlers(!!dirty, !!busy).beforeUnload(event as unknown as BeforeUnloadEvent);
    expect(event.preventDefault).toHaveBeenCalledTimes(dirty || busy ? 1 : 0);
    expect(event.returnValue).toBe(dirty || busy ? '' : undefined);
  }
});
