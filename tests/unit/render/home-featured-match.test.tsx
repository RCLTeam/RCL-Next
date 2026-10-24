import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, onTestFinished, test, vi } from 'vitest';
import type { Match } from '../../../apps/web/src/features/competition/types/competition.types.js';
import { HomeFeaturedMatch } from '../../../apps/web/src/site/pages/home/components/FeaturedMatch/FeaturedMatch.js';

// Exercise the component's handlers and effect in Node; SSR verifies the resulting markup.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effect: undefined as (() => undefined | (() => void)) | undefined,
  dependencies: undefined as readonly unknown[] | undefined,
  cleanup: undefined as (() => void) | undefined
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T,>(initial: T) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = initial;
      return [
        hooks.values[index],
        (value: T | ((previous: T) => T)) => {
          hooks.values[index] =
            typeof value === 'function'
              ? (value as (previous: T) => T)(hooks.values[index] as T)
              : value;
        }
      ];
    },
    useEffect: (effect: () => undefined | (() => void), dependencies: readonly unknown[]) => {
      if (
        !hooks.dependencies ||
        dependencies.some((value, index) => !Object.is(value, hooks.dependencies?.[index]))
      ) {
        hooks.dependencies = dependencies;
        hooks.effect = effect;
      }
    }
  };
});

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
let reduced = false;
let preference: EventTarget;
let props: Parameters<typeof HomeFeaturedMatch>[0];
let tree: ReturnType<typeof HomeFeaturedMatch>;

function render(next = props) {
  props = next;
  hooks.cursor = 0;
  tree = HomeFeaturedMatch(props);
  if (hooks.effect) {
    hooks.cleanup?.();
    hooks.cleanup = hooks.effect();
    hooks.effect = undefined;
  }
  return renderToStaticMarkup(tree);
}

type ElementProps = {
  children?: ReactNode;
  className?: string;
  'aria-label'?: string;
  onClick?: () => void;
};
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}
function active() {
  return elements(tree).find((element) => element.props.className?.includes('is-active'))?.props[
    'aria-label'
  ];
}
function click(label: string) {
  const button = elements(tree).find(
    (element) => element.type === 'button' && element.props['aria-label'] === label
  );
  expect(button).toBeDefined();
  button?.props.onClick?.();
  return render();
}
function advance(milliseconds = 10_000) {
  vi.advanceTimersByTime(milliseconds);
  return render();
}
function blur(inside: boolean) {
  tree.props.onBlur({ currentTarget: { contains: () => inside }, relatedTarget: {} });
  render();
}

beforeEach(() => {
  hooks.values = [];
  hooks.dependencies = undefined;
  hooks.effect = undefined;
  hooks.cleanup = undefined;
  reduced = false;
  props = { featured: first, liveMatches: matches };
  preference = new EventTarget();
  Object.defineProperty(preference, 'matches', { get: () => reduced });
  vi.useFakeTimers();
  vi.stubGlobal('window', { matchMedia: () => preference, setInterval, clearInterval });
  onTestFinished(() => {
    hooks.cleanup?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

test.each([[], [first]])(
  'renders a single featured card without carousel controls (%j)',
  (liveMatches) => {
    const html = render({ featured: first, liveMatches });
    expect(html.match(/<article/g)).toHaveLength(1);
    expect(html).not.toContain('aria-roledescription="carrusel"');
    expect(vi.getTimerCount()).toBe(0);
  }
);

test('renders the only live match when featured is omitted', () => {
  const html = render({ liveMatches: [first] });
  expect(html).toContain('En directo');
  expect(html).toContain('<article');
  expect(html).not.toContain('featured-empty');
});

test('uses the selected single match consistently for heading and card', () => {
  const html = render({ featured: { ...first, status: 'scheduled' }, liveMatches: [first] });
  expect(html).toContain('Próximo encuentro');
  expect(html).toContain('Programado');
  expect(render({})).toContain('href="/calendario"');
});

test('cycles accessible slides every ten seconds', () => {
  const html = render();
  expect(html).toContain('2 partidos en directo');
  expect(html).toContain('inert="" aria-hidden="true"');
  expect(active()).toBe('1 de 2');
  advance(9_999);
  expect(active()).toBe('1 de 2');
  const next = advance(1);
  expect(active()).toBe('2 de 2');
  expect(next).toContain(
    'inert="" aria-hidden="true" aria-roledescription="diapositiva" aria-label="1 de 2"'
  );
  advance();
  expect(active()).toBe('1 de 2');
});

test('pauses while hovered or focused and restarts only after both leave', () => {
  render();
  tree.props.onFocus();
  render();
  advance();
  expect(active()).toBe('1 de 2');
  tree.props.onMouseEnter();
  render();
  blur(false);
  advance();
  expect(active()).toBe('1 de 2');
  tree.props.onMouseLeave();
  render();
  advance();
  expect(active()).toBe('2 de 2');
});

test('moving focus between controls does not restart rotation', () => {
  render();
  tree.props.onFocus();
  render();
  blur(true);
  advance();
  expect(active()).toBe('1 de 2');
  blur(false);
  advance();
  expect(active()).toBe('2 de 2');
});

test('supports persistent pause and cyclic manual navigation', () => {
  render();
  expect(click('Pausar rotación automática')).toContain('aria-pressed="true"');
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

test('respects reduced motion initially and when changed, keeping manual access', () => {
  reduced = true;
  render();
  advance();
  expect(active()).toBe('1 de 2');
  click('Partido siguiente');
  expect(active()).toBe('2 de 2');
  reduced = false;
  preference.dispatchEvent(new Event('change'));
  advance();
  expect(active()).toBe('1 de 2');
  reduced = true;
  preference.dispatchEvent(new Event('change'));
  advance();
  expect(active()).toBe('1 de 2');
});

test('cleans up timers and preference listeners on shrink and unmount', () => {
  const remove = vi.spyOn(preference, 'removeEventListener');
  render();
  advance();
  render({ liveMatches: [first] });
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledTimes(1);
  render({ liveMatches: matches });
  hooks.cleanup?.();
  hooks.cleanup = undefined;
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledTimes(2);
});
