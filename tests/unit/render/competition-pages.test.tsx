import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ChampionsTable } from '../../../apps/web/src/features/competition/components/ChampionsTable.js';
import {
  DataState,
  MatchCard
} from '../../../apps/web/src/features/competition/components/CompetitionViews.js';
import { DivisionCard } from '../../../apps/web/src/features/competition/components/DivisionCard.js';
import { PlayoffBracket } from '../../../apps/web/src/features/competition/components/PlayoffBracket.js';
import { RoundFilter } from '../../../apps/web/src/features/competition/components/RoundFilter.js';
import { StandingsTable } from '../../../apps/web/src/features/competition/components/StandingsTable.js';
import { TeamCard } from '../../../apps/web/src/features/competition/components/TeamCard.js';
import type { Competition } from '../../../apps/web/src/features/competition/hooks/useCompetition.js';
import type {
  Match,
  Team
} from '../../../apps/web/src/features/competition/types/competition.types.js';
import { PlayoffsPage } from '../../../apps/web/src/site/pages/playoffs/PlayoffsPage.js';
import { PredictionsPage } from '../../../apps/web/src/site/pages/predictions/PredictionsPage.js';
import { StandingsPage } from '../../../apps/web/src/site/pages/standings/StandingsPage.js';

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
    seasons: { status: 'ready', data: [{ id: 'S1', name: 'Temporada 1' }] },
    season: { id: 'S1', name: 'Temporada 1' },
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

test('Predictions show only scheduled API matches, without invented votes or scores', () => {
  const competition = fixture();
  const html = renderToStaticMarkup(
    <PredictionsPage
      competition={{
        ...competition,
        calendar: {
          status: 'ready',
          data: [
            match,
            {
              ...match,
              id: 'next',
              status: 'scheduled',
              round: { ...playoffRound, name: 'Próxima serie' }
            }
          ]
        }
      }}
    />
  );
  expect(html).toContain('Lobos');
  expect(html).toContain('Próxima serie');
  expect(html).not.toContain('Gran final');
  expect(html).not.toContain('2–1');
  expect(html).toContain('Votación no disponible');
  const failed = renderToStaticMarkup(
    <PredictionsPage competition={{ ...competition, seasons: { status: 'error', data: [] } }} />
  );
  expect(failed).toContain('Reintentar');
  expect(failed).not.toContain('Lobos');
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

test('DivisionCard renders as SiteLink with default link to /ligas and default description when onClick is not provided', () => {
  const premierHtml = renderToStaticMarkup(
    <DivisionCard name="Rift Premier" subtitle="Elite · Máxima categoría" image="premier" />
  );
  expect(premierHtml).toContain('href="/ligas"');
  expect(premierHtml).toContain('class="league-card premier"');
  expect(premierHtml).toContain('Elite · Máxima categoría');
  expect(premierHtml).toContain('Rift Premier');
  expect(premierHtml).toContain('La máxima categoría de RCL');
  expect(premierHtml).toContain('Ver ligas →');

  const ascendHtml = renderToStaticMarkup(
    <DivisionCard name="Rift Ascend" subtitle="Ascenso" image="ascend" />
  );
  expect(ascendHtml).toContain('class="league-card ascend"');
  expect(ascendHtml).toContain('La cantera competitiva de RCL');
});

test('DivisionCard renders as interactive button with active state when onClick is provided without href', () => {
  let clicked = false;
  const html = renderToStaticMarkup(
    <DivisionCard
      name="Rift Premier"
      subtitle="Elite"
      image="premier"
      active={true}
      onClick={() => {
        clicked = true;
      }}
    />
  );
  expect(html).toContain('<button type="button"');
  expect(html).toContain('is-active');
  expect(html).not.toContain('href=');
});

test('DivisionCard respects custom href, description, and children', () => {
  const html = renderToStaticMarkup(
    <DivisionCard
      name="Custom Division"
      subtitle="Sub"
      image="premier"
      href="/clasificacion"
      description="Custom description text"
    >
      <span className="custom-action">Personalizado</span>
    </DivisionCard>
  );
  expect(html).toContain('href="/clasificacion"');
  expect(html).toContain('Custom description text');
  expect(html).toContain('Personalizado');
  expect(html).not.toContain('Ver ligas →');
});

test('Centralized tournament components render correctly', () => {
  const standingsHtml = renderToStaticMarkup(
    <StandingsTable
      rows={[
        {
          position: 1,
          team: home,
          played: 2,
          wins: 2,
          losses: 0,
          mapsWon: 4,
          mapsLost: 1,
          mapDifference: 3
        }
      ]}
    />
  );
  expect(standingsHtml).toContain('Lobos');
  expect(standingsHtml).toContain('>+3</td>');

  const bracketHtml = renderToStaticMarkup(
    <PlayoffBracket rounds={[playoffRound]} matches={[match]} />
  );
  expect(bracketHtml).toContain('Gran final');
  expect(bracketHtml).toContain('2');
  expect(bracketHtml).toContain('1');

  const roundFilterHtml = renderToStaticMarkup(
    <RoundFilter rounds={[playoffRound]} value="3" onChange={() => {}} />
  );
  expect(roundFilterHtml).toContain('value="3"');
  expect(roundFilterHtml).toContain('Gran final');

  const teamCardHtml = renderToStaticMarkup(<TeamCard team={home} divisionName="Premier" />);
  expect(teamCardHtml).toContain('Lobos');
  expect(teamCardHtml).toContain('Premier');
  expect(teamCardHtml).toContain('LOB');

  const championsHtml = renderToStaticMarkup(<ChampionsTable />);
  expect(championsHtml).toContain('Las estadísticas de campeones todavía no están disponibles.');
});

test('StandingsTable handles malformed or incomplete data gracefully', () => {
  const html = renderToStaticMarkup(
    <StandingsTable
      rows={[
        {
          position: 2,
          team: { id: 'team2', name: '<script>alert(1)</script>', shortName: 'MAL', logoUrl: null },
          // @ts-expect-error forcing undefined for adversarial test
          played: undefined,
          // @ts-expect-error
          wins: undefined,
          // @ts-expect-error
          losses: null,
          // @ts-expect-error
          mapsWon: undefined,
          // @ts-expect-error
          mapsLost: undefined,
          // @ts-expect-error
          mapDifference: undefined
        }
      ]}
    />
  );
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).toContain('<td class="wins">0</td>');
  expect(html).not.toContain('undefined');
});

test('PlayoffBracket handles missing teams and scores gracefully', () => {
  const html = renderToStaticMarkup(
    <PlayoffBracket
      rounds={[playoffRound]}
      matches={[
        {
          id: 'malformed-match',
          // @ts-expect-error
          homeTeam: undefined,
          // @ts-expect-error
          awayTeam: undefined,
          // @ts-expect-error
          homeScore: undefined,
          // @ts-expect-error
          awayScore: undefined,
          // @ts-expect-error
          status: undefined,
          bestOf: 3,
          scheduledAt: null,
          streamUrl: null,
          round: playoffRound
        }
      ]}
    />
  );
  expect(html).toContain('Por definir');
  expect(html).toContain('—');
  expect(html).not.toContain('undefined');
});
