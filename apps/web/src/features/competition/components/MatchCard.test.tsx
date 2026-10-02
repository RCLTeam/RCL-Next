import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Match } from '../types/competition.types.js';
import { MatchCard } from './MatchCard.js';

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
