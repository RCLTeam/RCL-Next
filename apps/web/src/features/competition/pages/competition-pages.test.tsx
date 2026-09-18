import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DataState, MatchCard } from '../../site/components/CompetitionViews.js';
import type { Match, Team } from '../competition.types.js';
import type { Competition } from '../hooks/useCompetition.js';
import { PlayoffsPage } from './PlayoffsPage.js';
import { StandingsPage } from './StandingsPage.js';

const home: Team = { id: 'home', name: 'Lobos', shortName: 'LOB', logoUrl: null };
const away: Team = { id: 'away', name: 'Cuervos', shortName: 'CUE', logoUrl: null };
const playoffRound = { id: '3', sequence: 3, stage: 'playoff', name: 'Gran final' };
const match: Match = {
  id: 'match-1',
  homeTeam: home,
  awayTeam: away,
  homeScore: 2,
  awayScore: 1,
  bestOf: 3,
  status: 'completed',
  scheduledAt: null,
  streamUrl: null,
  round: playoffRound
};

function fixture(): Competition {
  return {
    seasons: { status: 'ready', data: [{ id: 'S1', name: 'Temporada 1', isActive: true }] },
    season: { id: 'S1', name: 'Temporada 1', isActive: true },
    divisions: {
      status: 'ready',
      data: [{ id: 'D1', seasonId: 'S1', code: 'premier', name: 'Premier', sortOrder: 1 }]
    },
    division: { id: 'D1', seasonId: 'S1', code: 'premier', name: 'Premier', sortOrder: 1 },
    teams: { status: 'ready', data: [home, away] },
    rounds: {
      status: 'ready',
      data: [{ id: '1', sequence: 1, stage: 'regular', name: 'Jornada regular' }, playoffRound]
    },
    calendar: { status: 'ready', data: [match] },
    standings: {
      status: 'ready',
      data: [
        {
          position: 1,
          team: home,
          played: 1,
          wins: 1,
          losses: 0,
          mapsWon: 2,
          mapsLost: 1,
          mapDifference: 1
        }
      ]
    },
    selectSeason: () => {},
    selectDivision: () => {},
    retry: () => {}
  };
}

test('Match cards distinguish scheduled matches from played scores and omit unsafe stream links', () => {
  const completed = renderToStaticMarkup(<MatchCard match={match} />);
  expect(completed).toContain('2–1');
  expect(completed).toContain('Finalizado');
  const scheduled = renderToStaticMarkup(
    <MatchCard match={{ ...match, status: 'scheduled', streamUrl: 'javascript:alert(1)' }} />
  );
  expect(scheduled).toContain('>VS<');
  expect(scheduled).not.toContain('2–1');
  expect(scheduled).not.toContain('javascript:');
});

test('Playoffs use the API playoff stage and exclude regular rounds', () => {
  const html = renderToStaticMarkup(<PlayoffsPage competition={fixture()} />);
  expect(html).toContain('Gran final');
  expect(html).toContain('Lobos');
  expect(html).toContain('Cuervos');
  expect(html).not.toContain('Jornada regular');
});

test('Standings render backend totals and hide them if the season request fails', () => {
  const competition = fixture();
  const html = renderToStaticMarkup(<StandingsPage competition={competition} />);
  expect(html).toContain('Lobos');
  expect(html).toContain('>+1</td>');
  const failed = renderToStaticMarkup(
    <StandingsPage competition={{ ...competition, seasons: { status: 'error', data: [] } }} />
  );
  expect(failed).toContain('Reintentar');
  expect(failed).not.toContain('Lobos');
});

test('Loading and error states never render stale child content', () => {
  for (const status of ['loading', 'error'] as const) {
    const html = renderToStaticMarkup(
      <DataState state={{ status, data: ['old'] }} empty="Empty" retry={() => {}}>
        Old division results
      </DataState>
    );
    expect(html).not.toContain('Old division results');
    expect(html).toContain(status === 'loading' ? 'Cargando competición' : 'Reintentar');
  }
});
