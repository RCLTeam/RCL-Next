import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Match } from '../../../features/competition/types/competition.types.js';
import { PredictionCard } from './PredictionCard.js';
import { PredictorRankingPanel } from './PredictorRankingPanel.js';

const match: Match = {
  id: 'm',
  homeTeam: { id: 'home', name: 'Home', shortName: null, logoUrl: null, discordRoleId: '0' },
  awayTeam: {
    id: 'away',
    name: 'Away',
    shortName: null,
    logoUrl: null,
    discordRoleId: '123456789012345678'
  },
  bestOf: 3,
  status: 'scheduled',
  scheduledAt: '2026-10-02T18:00:00Z',
  homeScore: 0,
  awayScore: 0,
  round: null,
  streamUrl: null,
  streamUrlLive: null
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
test.each(['-9000', '-11', '-10', '-1', null, undefined])(
  'inactive participant with role %s cannot receive predictions even with an open summary',
  (discordRoleId) => {
    for (const side of ['homeTeam', 'awayTeam'] as const) {
      const html = renderToStaticMarkup(
        <PredictionCard
          match={{
            ...match,
            [side]: { id: side, name: 'Inactive', shortName: null, logoUrl: null, discordRoleId }
          }}
          summary={{ matchId: 'm', open: true, closed: false, homePercent: null, votes: null }}
          authenticated
          save={async () => {}}
        />
      );
      expect(html).not.toContain('<form');
      expect(html).toContain('Predicciones no disponibles');
    }
  }
);

test('ranking shows the top five and the current user outside them', () => {
  const ranking = Array.from({ length: 8 }, (_, i) => ({
    userId: `${i}`,
    name: `Predictor ${i}`,
    avatarHash: null,
    position: i + 1,
    points: 30 - i,
    correct: 10 - i,
    total: 10
  }));
  const html = renderToStaticMarkup(
    <PredictorRankingPanel ranking={ranking} userId="7" season="2026" />
  );
  expect(html).toContain('Predictor 7');
  expect(html).not.toContain('tú,');
  expect(html).not.toContain('Predictor 5');
  expect(html).toContain('3 de 10 aciertos');
  const rows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
  expect(rows).toHaveLength(6);
  const highlightedRows = rows.filter((row) => row.includes('class="predictor-row is-you"'));
  expect(highlightedRows).toHaveLength(1);
  expect(highlightedRows[0]).toContain('<strong>Predictor 7</strong>');
});

test.each(['0123456789abcdef0123456789abcdef', 'a_0123456789abcdef0123456789abcdef'])(
  'ranking loads avatar %s through the same-origin proxy',
  (avatarHash) => {
    const html = renderToStaticMarkup(
      <PredictorRankingPanel
        ranking={[
          {
            userId: '123456789012345678',
            name: 'Jugador',
            avatarHash,
            position: 1,
            points: 30,
            correct: 10,
            total: 10
          }
        ]}
      />
    );
    expect(html).toContain('<img');
    expect(html).toContain(`src="/api/v1/discord-avatars/123456789012345678/${avatarHash}"`);
    expect(html).not.toContain('cdn.discordapp.com');
  }
);

test('ranking shows initials without requesting an image when the avatar is missing', () => {
  const html = renderToStaticMarkup(
    <PredictorRankingPanel
      ranking={[
        {
          userId: '123456789012345678',
          name: 'Jugador',
          avatarHash: null,
          position: 1,
          points: 30,
          correct: 10,
          total: 10
        }
      ]}
    />
  );
  expect(html).toContain('<span class="predictor-avatar" aria-hidden="true">JU</span>');
  expect(html).not.toContain('<img');
});

test('closed voting keeps community data hidden until completion, including zero-vote results', () => {
  for (const votes of [null, 0]) {
    const html = renderToStaticMarkup(
      <PredictionCard
        match={match}
        summary={{ matchId: 'm', open: false, closed: true, votes, homePercent: null }}
        authenticated
        save={async () => {}}
      />
    );
    expect(html).not.toContain('<form');
    expect(html.includes('Los porcentajes se revelan al finalizar el partido.')).toBe(
      votes === null
    );
    expect(html.includes('Sin votos para esta serie.')).toBe(votes === 0);
    expect(html.includes('width:50%')).toBe(votes === null);
    expect(html.match(/>\?\?<\/span>/g) ?? []).toHaveLength(votes === null ? 2 : 0);
  }
});
