import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Match } from '../types/competition.types.js';
import { MatchCard } from './MatchCard.js';

const processTimeZone = process.env.TZ;
// Render as a visitor outside the league's time zone.
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (processTimeZone === undefined) Reflect.deleteProperty(process.env, 'TZ');
  else process.env.TZ = processTimeZone;
});

const match: Match = {
  id: 'match',
  status: 'completed',
  homeScore: 2,
  awayScore: 1,
  bestOf: 3,
  scheduledAt: null,
  round: null,
  streamUrl: null,
  streamUrlLive: 'https://www.twitch.tv/rcl_lol'
};

test.each([null, ''])(
  'completed matches without a recording (%s) show no broadcast',
  (streamUrl) => {
    const html = renderToStaticMarkup(<MatchCard match={{ ...match, streamUrl }} />);
    expect(html).toContain('Sin emisión');
    expect(html).not.toContain('twitch.tv');
    expect(html).not.toContain('match-stream-link');
  }
);

test('completed matches link to the recording even when a live URL remains', () => {
  const streamUrl = 'https://www.youtube.com/watch?v=recording';
  const html = renderToStaticMarkup(<MatchCard match={{ ...match, streamUrl }} />);
  expect(html).toContain(`href="${streamUrl}"`);
  expect(html).not.toContain('twitch.tv');
  expect(html).not.toContain('Sin emisión');
});

test('live matches use the live URL even when a recording exists', () => {
  const html = renderToStaticMarkup(
    <MatchCard
      match={{ ...match, status: 'live', streamUrl: 'https://www.youtube.com/watch?v=recording' }}
    />
  );
  expect(html).toContain(`href="${match.streamUrlLive}"`);
  expect(html).not.toContain('youtube.com');
});

test('shows the match date and time in Madrid time, not the browser time zone', () => {
  // 22:30 UTC on 4 October is 00:30 on 5 October in Madrid and 18:30 on 4 October in New York.
  const html = renderToStaticMarkup(
    <MatchCard match={{ ...match, status: 'scheduled', scheduledAt: '2026-10-04T22:30:00Z' }} />
  );
  expect(html).toContain('05 oct');
  expect(html).toContain('<strong>00:30</strong>');
  expect(html).not.toContain('18:30');
});
