import { expect, test, vi } from 'vitest';
import { browserNavigation } from './browser-navigation.js';

function browserFixture() {
  const events = new EventTarget();
  const entries = [{ path: '/admin/home-content', state: {} as Record<string, unknown> }];
  let position = 0;
  const location = { pathname: entries[0]?.path, reload: vi.fn() };
  const history = {
    get state() {
      return entries[position]?.state;
    },
    replaceState(state: Record<string, unknown>) {
      entries[position] = { path: location.pathname ?? '/', state };
    },
    pushState(state: Record<string, unknown>, _title: string, path: string) {
      entries.splice(++position, entries.length, { path, state });
      location.pathname = path;
    },
    go(delta: number) {
      position += delta;
      location.pathname = entries[position]?.path;
      const event = new Event('popstate');
      Object.assign(event, { state: entries[position]?.state });
      events.dispatchEvent(event);
    }
  };
  const browser = {
    history,
    location,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events)
  } as unknown as Window;
  return { browser, history, location, entries };
}

test('cancelled links preserve the editor and do not add history entries', () => {
  const { browser, entries, location } = browserFixture();
  const changed = vi.fn();
  const navigation = browserNavigation(changed, () => false, browser);
  expect(navigation.navigate('/admin/crud')).toBe(false);
  expect(location.pathname).toBe('/admin/home-content');
  expect(entries).toHaveLength(1);
  expect(changed).not.toHaveBeenCalled();
  navigation.dispose();
});

test('cancel Back and Forward restores the original entry without duplicating history', () => {
  const { browser, history, location, entries } = browserFixture();
  const changed = vi.fn();
  const leave = vi.fn().mockReturnValue(true);
  const navigation = browserNavigation(changed, leave, browser);
  navigation.navigate('/admin/crud');
  navigation.navigate('/admin/home-content');
  changed.mockClear();
  leave.mockReturnValue(false);
  history.go(-2);
  expect(location.pathname).toBe('/admin/home-content');
  expect(changed).not.toHaveBeenCalled();
  expect(entries).toHaveLength(3);
  leave.mockReturnValue(true);
  history.go(-1);
  expect(changed).toHaveBeenLastCalledWith('/admin/crud');
  leave.mockReturnValue(false);
  history.go(1);
  expect(location.pathname).toBe('/admin/crud');
  leave.mockReturnValue(true);
  history.go(1);
  expect(changed).toHaveBeenLastCalledWith('/admin/home-content');
  expect(entries).toHaveLength(3);
  navigation.dispose();
});

test('same-page links neither prompt nor remount the editor', () => {
  const { browser } = browserFixture();
  const leave = vi.fn();
  const changed = vi.fn();
  const navigation = browserNavigation(changed, leave, browser);
  navigation.navigate('/admin/home-content');
  expect(leave).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  navigation.dispose();
});
