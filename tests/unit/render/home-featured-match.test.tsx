// @vitest-environment jsdom
import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Match } from '../../../apps/web/src/features/competition/types/competition.types.js';
import { HomeFeaturedMatch } from '../../../apps/web/src/site/pages/home/components/FeaturedMatch/FeaturedMatch.js';

const first: Match = {
  id: 'first',
  status: 'live',
  homeScore: 0,
  awayScore: 0,
  bestOf: 3,
  scheduledAt: null,
  streamUrl: null,
  streamUrlLive: 'https://www.twitch.tv/rcl',
  round: null
};
const matches = [first, { ...first, id: 'second' }];
let container: HTMLDivElement;
let root: Root;
let reduced: boolean;
let preference: EventTarget;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  reduced = false;
  preference = new EventTarget();
  Object.defineProperty(preference, 'matches', { get: () => reduced });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => preference)
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const render = (liveMatches = matches, featured = first) => {
  act(() => root.render(<HomeFeaturedMatch featured={featured} liveMatches={liveMatches} />));
};
const advance = () => act(() => vi.advanceTimersByTime(10_000));
const active = () => container.querySelector('.is-active')?.getAttribute('aria-label');
const click = (label: string) =>
  act(() => {
    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === label
    );
    expect(button).toBeDefined();
    button?.click();
  });

test.each([{ liveMatches: [] }, { liveMatches: [first] }])(
  'renders a single featured card with $liveMatches.length live matches',
  ({ liveMatches }) => {
    render(liveMatches);
    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(container.querySelector('[aria-roledescription="carrusel"]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  }
);
test('renders a scheduled match and the empty calendar fallback', () => {
  render([], { ...first, status: 'scheduled' });
  expect(container.textContent).toContain('Próximo encuentro');
  expect(container.textContent).toContain('Programado');
  act(() => root.render(<HomeFeaturedMatch />));
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/calendario');
});
test('renders the live counter and cycles accessible slides every ten seconds', () => {
  render();
  expect(container.textContent).toContain('2 partidos en directo');
  expect(active()).toBe('1 de 2');
  const slides = container.querySelectorAll('.featured-match-slide');
  expect(slides[0]?.hasAttribute('inert')).toBe(false);
  expect(slides[1]?.hasAttribute('inert')).toBe(true);
  expect(slides[1]?.getAttribute('aria-hidden')).toBe('true');
  act(() => vi.advanceTimersByTime(9_999));
  expect(active()).toBe('1 de 2');
  act(() => vi.advanceTimersByTime(1));
  expect(active()).toBe('2 de 2');
  expect(slides[0]?.hasAttribute('inert')).toBe(true);
  expect(slides[1]?.getAttribute('aria-hidden')).toBe('false');
  advance();
  expect(active()).toBe('1 de 2');
});
test('preserves focus within the card and pauses while hovered or focused', () => {
  render();
  const carousel = container.firstElementChild;
  const link = container.querySelector<HTMLAnchorElement>('.is-active a');
  if (!carousel || !link) throw new Error('Missing carousel or stream link');
  act(() => link.focus());
  advance();
  expect(document.activeElement).toBe(link);
  expect(active()).toBe('1 de 2');
  act(() => carousel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  act(() => link.blur());
  advance();
  expect(active()).toBe('1 de 2');
  act(() => carousel.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
  advance();
  expect(active()).toBe('2 de 2');
});
test('moving focus between controls does not restart rotation', () => {
  render();
  const buttons = container.querySelectorAll('button');
  act(() => buttons[0]?.focus());
  act(() => buttons[1]?.focus());
  advance();
  expect(active()).toBe('1 de 2');
  act(() => buttons[1]?.blur());
  advance();
  expect(active()).toBe('2 de 2');
});
test('supports persistent pause and cyclic manual navigation', () => {
  render();
  click('Pausar rotación automática');
  expect(container.querySelector('[aria-pressed="true"]')).not.toBeNull();
  advance();
  expect(active()).toBe('1 de 2');
  click('Partido anterior');
  expect(active()).toBe('2 de 2');
  click('Partido siguiente');
  expect(active()).toBe('1 de 2');
  click('Pausar rotación automática');
  advance();
  expect(active()).toBe('2 de 2');
});
test('respects reduced motion initially and when it changes, with manual access', () => {
  reduced = true;
  render();
  advance();
  expect(active()).toBe('1 de 2');
  click('Partido siguiente');
  expect(active()).toBe('2 de 2');
  act(() => {
    reduced = false;
    preference.dispatchEvent(new Event('change'));
  });
  advance();
  expect(active()).toBe('1 de 2');
  act(() => {
    reduced = true;
    preference.dispatchEvent(new Event('change'));
  });
  advance();
  expect(active()).toBe('1 de 2');
});
test('cleans up timers and preference listeners when matches shrink or component unmounts', () => {
  const remove = vi.spyOn(preference, 'removeEventListener');
  render();
  advance();
  render([first]);
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalled();
  render();
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledTimes(2);
});
