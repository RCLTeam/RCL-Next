import type { MatchDetail, MatchParticipant, MatchPlayerStats } from '@rcl/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from '../../../apps/web/src/App.js';
import { MatchCard } from '../../../apps/web/src/features/competition/components/MatchCard.js';
import { MatchReport } from '../../../apps/web/src/site/pages/match-details/MatchDetailPage.js';
import {
  formatMatchStat,
  matchPosition,
  positionRows
} from '../../../apps/web/src/site/pages/match-details/match-stats.js';

const home = { id: 'home', name: 'Lobos', shortName: 'LOB', logoUrl: null };
const away = { id: 'away', name: 'Cuervos', shortName: 'CUE', logoUrl: null };
const player: MatchParticipant = {
  id: 'p1',
  playerId: 'p1',
  gameName: 'Mid Player',
  riotTag: 'EUW',
  champion: 'Ahri',
  position: 'MIDDLE',
  side: 'red',
  teamId: home.id,
  stats: null,
  runes: null,
  build: null
};
const report: MatchDetail = {
  id: 'match',
  homeTeam: home,
  awayTeam: away,
  homeScore: 2,
  awayScore: 1,
  bestOf: 3,
  status: 'completed',
  winnerTeamId: home.id,
  seasonName: 'T1',
  divisionName: 'Premier',
  roundName: 'Final',
  games: [
    {
      id: 'map1',
      gameNumber: 1,
      blueTeamId: away.id,
      redTeamId: home.id,
      winnerTeamId: home.id,
      durationSeconds: 1500,
      participants: [player]
    },
    {
      id: 'map2',
      gameNumber: 2,
      blueTeamId: home.id,
      redTeamId: away.id,
      winnerTeamId: away.id,
      durationSeconds: null,
      participants: []
    }
  ]
};

test('Completed calendar matches expose a readable detail link; scheduled ones do not', () => {
  const match = {
    id: report.id,
    slug: 'lobos-vs-cuervos',
    homeTeam: home,
    awayTeam: away,
    homeScore: 2,
    awayScore: 1,
    bestOf: 3,
    status: 'completed' as const,
    scheduledAt: null,
    streamUrl: 'https://example.com/stream',
    round: null
  };
  const html = renderToStaticMarkup(<MatchCard match={match} />);
  expect(html).toContain('href="/partidos/lobos-vs-cuervos"');
  expect(html).toContain('href="https://example.com/stream"');
  expect(
    renderToStaticMarkup(<MatchCard match={{ ...match, status: 'scheduled' }} />)
  ).not.toContain('/partidos/');
});

test('Reports expose player runes from matchups, multiple maps and accurate sides with missing data', () => {
  const html = renderToStaticMarkup(<MatchReport match={report} />);
  expect(html).toContain('2 – 1');
  expect(html).toContain('Mapa 2');
  expect(html).toContain('25:00');
  expect(html).toContain('Lobos · Lado rojo');
  expect(html).toContain('Mid Player');
  expect(html).toContain('role="tablist"');
  expect(html).toContain('aria-selected="true"');
  expect(html).not.toContain('tab-runas');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('Ver runas de Mid Player#EUW');
  expect(html).toContain('Build no disponible');
  const empty = renderToStaticMarkup(<MatchReport match={{ ...report, games: [] }} />);
  expect(empty).toContain('todavia no se han importado');
});

test('Duration stats display minutes and seconds while other values remain numeric', () => {
  expect(formatMatchStat('timeSpentDead', 125)).toBe('02:05');
  expect(formatMatchStat('longestTimeLiving', 3601)).toBe('60:01');
  expect(formatMatchStat('crowdControlTime', 0)).toBe('00:00');
  expect(formatMatchStat('timeSpentDead', null)).toBe('—');
  expect(formatMatchStat('kills', 12)).toBe('12');
});

test('the series award comes from the API, independently of the displayed map or legacy flags', () => {
  const maps = report.games.map((game, index) => ({
    ...game,
    participants:
      index === 0
        ? [
            {
              ...player,
              playerId: 'legacy',
              gameName: 'Legacy winner',
              stats: { kills: 99, deaths: 0, assists: 99, isMvp: true } as MatchPlayerStats
            }
          ]
        : [player]
  }));
  for (const games of [maps, [...maps].reverse()]) {
    const html = renderToStaticMarkup(
      <MatchReport match={{ ...report, mvpPlayerId: player.playerId, games }} />
    );
    expect(html).toContain('MVP del enfrentamiento');
    expect(html).toContain('href="/jugadores/p1">Mid Player#EUW</a>');
  }
  const missing = renderToStaticMarkup(
    <MatchReport match={{ ...report, mvpPlayerId: null, games: maps }} />
  );
  expect(missing).toContain('No disponible.');
  expect(missing).not.toContain(
    'class="match-series-mvp"><span class="meta">MVP del enfrentamiento</span><a'
  );
});

test('a persisted MVP links to their profile even when replay participants are unavailable', () => {
  const html = renderToStaticMarkup(
    <MatchReport match={{ ...report, mvpPlayerId: 'saved-player', games: [] }} />
  );
  expect(html).toContain('href="/jugadores/saved-player">Ver jugador MVP</a>');
  const forfeit = renderToStaticMarkup(
    <MatchReport match={{ ...report, status: 'forfeit', mvpPlayerId: player.playerId }} />
  );
  expect(forfeit).not.toContain('MVP del enfrentamiento');
});

test('Position pairing uses match team IDs, normalizes roles, and retains duplicate or unknown positions', () => {
  const other = { ...player, id: 'p2', teamId: away.id, side: 'blue' as const, position: 'MID' };
  const rows = positionRows(
    [player, other, { ...player, id: 'p3' }, { ...player, id: 'p4', position: null }],
    home.id,
    away.id
  );
  expect(rows.find((row) => row.position === 'MID')?.home?.id).toBe('p1');
  expect(rows.find((row) => row.position === 'MID')?.away?.id).toBe('p2');
  expect(rows.flatMap((row) => [row.home?.id, row.away?.id]).filter(Boolean)).toHaveLength(4);
  expect(matchPosition('BOTTOM')).toBe('ADC');
  expect(matchPosition('UTILITY')).toBe('SUPPORT');
});

test('Direct match URLs and trailing slashes preserve calendar navigation', () => {
  for (const path of ['/partidos/lobos-vs-cuervos', '/partidos/lobos-vs-cuervos/']) {
    const html = renderToStaticMarkup(<App initialPath={path} />);
    expect(html).toContain('Cargando partido');
    expect(
      (html.match(/<a\b[^>]*>/g) ?? []).some(
        (tag) => tag.includes('href="/calendario"') && tag.includes('aria-current="page"')
      )
    ).toBe(true);
  }
});

test('series MVP identity links by slug even without imported participants', () => {
  const html = renderToStaticMarkup(
    <MatchReport
      match={{
        ...report,
        games: [],
        mvpPlayerId: 'saved',
        mvpPlayer: { id: 'saved', slug: 'ganador-euw', gameName: 'Ganador', riotTag: 'EUW' }
      }}
    />
  );
  expect(html).toContain('href="/jugadores/ganador-euw">Ganador#EUW</a>');
  expect(html).not.toContain('Ver jugador MVP');
});
