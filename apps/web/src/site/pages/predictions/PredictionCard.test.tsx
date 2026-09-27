import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Match } from '../../../features/competition/types/competition.types.js';
import { PredictionCard } from './PredictionCard.js';
import { PredictorRankingPanel } from './PredictorRankingPanel.js';

const match: Match = {
  id: 'm',
  bestOf: 3,
  status: 'scheduled',
  scheduledAt: '2026-10-02T18:00:00Z',
  homeScore: 0,
  awayScore: 0,
  round: null,
  streamUrl: null
};
test('percentages stay hidden even if supplied while voting is open; closed cards have no form', () => {
  const summary = { matchId: 'm', open: true, closed: false, homePercent: 73, votes: 100 };
  const open = renderToStaticMarkup(
    <PredictionCard match={match} summary={summary} authenticated save={async () => {}} />
  );
  expect(open).not.toContain('73%');
  expect(open).toContain('Guardar predicción');
  const closed = renderToStaticMarkup(
    <PredictionCard
      match={match}
      summary={{ ...summary, open: false, closed: true }}
      authenticated
      save={async () => {}}
    />
  );
  expect(closed).toContain('73%');
  expect(closed).toContain('27%');
  expect(closed).not.toContain('<form');
});
test('ranking shows the top five and the current user outside them', () => {
  const ranking = Array.from({ length: 8 }, (_, i) => ({
    userId: `${i}`,
    name: `Predictor ${i}`,
    position: i + 1,
    points: 30 - i,
    correct: 10 - i,
    total: 10
  }));
  const html = renderToStaticMarkup(
    <PredictorRankingPanel ranking={ranking} userId="7" season="2026" />
  );
  expect(html).toContain('tú, Predictor 7');
  expect(html).not.toContain('Predictor 5');
  expect(html).toContain('3 de 10 aciertos');
});
