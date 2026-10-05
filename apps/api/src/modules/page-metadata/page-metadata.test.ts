import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPageMetadata, pageMetadata } from '@rcl/contracts';
import express from 'express';
import request from 'supertest';
import { afterEach, expect, test, vi } from 'vitest';
import { notFound } from '../../shared/app-error.js';
import type { CompetitionRepository, Match } from '../competition/competition.repository.js';
import { CompetitionService } from '../competition/competition.service.js';
import { pageMetadataRouter, webPageRouter } from './page-metadata.router.js';
import { PageMetadataService } from './page-metadata.service.js';

const competition = () => ({
  teamSummary: vi.fn(),
  playerSummary: vi.fn(),
  matchSummary: vi.fn()
});

test('Detail metadata includes the record and only requests its resource', async () => {
  const source = competition();
  source.teamSummary.mockResolvedValue({
    name: 'Rebels',
    divisionName: 'Primera',
    seasonName: '2026'
  });
  source.playerSummary.mockResolvedValue({ gameName: 'Player', riotTag: 'EUW' });
  source.matchSummary.mockResolvedValue({
    homeTeam: { name: 'A' },
    awayTeam: { name: 'B' },
    homeScore: 2,
    awayScore: 1,
    divisionName: 'Primera'
  });
  const article = vi
    .fn()
    .mockResolvedValue({ title: 'Final', excerpt: 'Así se decidió la corona.' });
  const service = new PageMetadataService(source, { article });
  expect((await service.resolve('/equipos/rebels/')).metadata.description).toContain(
    'Rebels en Primera'
  );
  expect(source.teamSummary).toHaveBeenCalledWith('rebels');
  expect((await service.resolve('/jugadores/player')).metadata.description).toContain('Player#EUW');
  expect((await service.resolve('/partidos/final')).metadata.description).toContain('A 2–1 B');
  expect((await service.resolve('/editorial/article')).metadata.description).toBe(
    'Así se decidió la corona.'
  );
  source.teamSummary.mockRejectedValue(notFound('Team'));
  expect((await service.resolve('/equipos/missing')).metadata.title).toBe('Página no encontrada');
});

test('Fixed pages are found and unknown or malformed paths are not', async () => {
  const service = new PageMetadataService(competition());
  for (const path of Object.keys(pageMetadata)) {
    expect(await service.resolve(path), path).toEqual({
      metadata: getPageMetadata(path),
      found: true
    });
    if (path !== '/') expect((await service.resolve(`${path}/`)).found, path).toBe(true);
  }
  for (const path of ['/ruta-inexistente', '/404', '/equipos/a/b', '/editorial/%E0%A4%A'])
    expect(await service.resolve(path), path).toEqual({
      metadata: getPageMetadata('/404'),
      found: false
    });
  // Without the editorial service the article cannot be checked, so the page is kept.
  expect(await service.resolve('/editorial/any')).toEqual({
    metadata: getPageMetadata('/editorial/any'),
    found: true
  });
});

test('The initial HTTP HTML contains route metadata without executing browser JavaScript', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rcl-metadata-'));
  try {
    const template = await readFile(new URL('../../../../web/index.html', import.meta.url), 'utf8');
    await writeFile(join(directory, 'index.html'), template);
    const service = new PageMetadataService(competition());
    const app = express().use(pageMetadataRouter(service)).use(webPageRouter(directory, service));
    const teams = await request(app).get('/equipos').expect(200);
    const calendar = await request(app).get('/calendario').expect(200);
    expect(teams.text).toContain('Conoce los equipos y sus plantillas');
    expect(calendar.text).toContain('Consulta los encuentros');
    expect(teams.text).toContain('og:description');
    expect(teams.text).toContain('twitter:description');
    await request(app).get('/api/unknown').expect(404);
    await request(app).get('/assets/missing.js').expect(404);
    const json = await request(app).get('/api/v1/page-metadata?path=/calendario').expect(200);
    expect(calendar.text).toContain(json.body.data.description);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Unknown routes and missing records answer 404 with the not-found HTML', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rcl-metadata-'));
  try {
    const template = await readFile(new URL('../../../../web/index.html', import.meta.url), 'utf8');
    await writeFile(join(directory, 'index.html'), template);
    const source = competition();
    source.teamSummary.mockImplementation(async (id: string) => {
      if (id !== 'rebels') throw notFound('Team');
      return { name: 'Rebels', divisionName: 'Primera', seasonName: '2026' };
    });
    const service = new PageMetadataService(source);
    const app = express().use(pageMetadataRouter(service)).use(webPageRouter(directory, service));
    for (const path of ['/ruta-inexistente', '/equipos/no-existe', '/equipos/rebels/extra']) {
      const response = await request(app).get(path).set('Accept', 'text/html').expect(404);
      expect(response.type).toBe('text/html');
      expect(response.text).toContain('<div id="root">');
      expect(response.text).toContain('<title>Página no encontrada · Rebel Crown Legacy</title>');
      await request(app).head(path).set('Accept', 'text/html').expect(404);
    }
    for (const path of ['/', '/index.html', '/campeones', '/campeones/', '/equipos/rebels']) {
      await request(app).get(path).set('Accept', 'text/html').expect(200);
      await request(app).head(path).set('Accept', 'text/html').expect(200);
    }
    expect((await request(app).get('/equipos/rebels').set('Accept', 'text/html')).text).toContain(
      '<title>Rebels · Rebel Crown Legacy</title>'
    );
    // The metadata endpoint describes the page, so it keeps answering 200.
    const json = await request(app).get('/api/v1/page-metadata?path=/ruta-inexistente').expect(200);
    expect(json.body.data.title).toBe('Página no encontrada');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const divisionId = '20000000-0000-4000-8000-000000000001';
const homeId = 'a0000000-0000-4000-8000-00000000000a';
const awayId = 'a0000000-0000-4000-8000-00000000000b';
const playerId = 'b0000000-0000-4000-8000-00000000000c';
const matchId = (index: number) => `c0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;

// Every repository method is counted; each one issues at least one database query.
function countingRepository(completedMatches: number, statuses: Match['status'][] = []) {
  const calls: string[] = [];
  const matches: Match[] = Array.from({ length: completedMatches }, (_, index) => ({
    id: matchId(index),
    divisionId,
    roundId: '1',
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeScore: 2,
    awayScore: 1,
    winnerTeamId: homeId,
    status: statuses[index] ?? 'completed',
    bestOf: 3,
    scheduledAt: null,
    finishedAt: null,
    streamUrl: null,
    streamUrlLive: null
  }));
  const directory = [
    { id: homeId, name: 'Rebels', seasonName: '2026', divisionName: 'Primera' },
    { id: awayId, name: 'Crown', seasonName: '2026', divisionName: 'Primera' }
  ];
  const player = {
    id: playerId,
    gameName: 'Player',
    riotTag: 'EUW',
    countryCode: null,
    isMain: true,
    displayName: null
  };
  const source: CompetitionRepository = {
    championPicks: async () => [],
    matchDirectory: async () =>
      matches.map(({ id, homeTeamId, awayTeamId, roundId }) => ({
        id,
        homeTeamId,
        awayTeamId,
        roundId
      })),
    // PostgreSQL compares uuid values regardless of letter case.
    match: async (id) => matches.find((match) => match.id === id.toLowerCase()),
    matchGames: async () => [],
    matchGamesByMatch: async (ids) => new Map(ids.map((id) => [id, []])),
    teamDirectory: async () => directory,
    players: async () => [player],
    playerDetail: async (id) =>
      id === playerId ? { ...player, linkedAccounts: [], teams: [] } : undefined,
    teamDetail: async (id) => {
      const team = directory.find((entry) => entry.id === id);
      return team
        ? {
            ...team,
            divisionId,
            shortName: null,
            logoUrl: null,
            color: null,
            isActive: true,
            members: []
          }
        : undefined;
    },
    seasons: async () => [],
    season: async () => undefined,
    divisions: async () => [],
    division: async (id) =>
      id === divisionId
        ? { id, seasonId: '2026', code: 'Primera', name: 'Primera', sortOrder: 1 }
        : undefined,
    teams: async () =>
      directory.map((team) => ({
        id: team.id,
        divisionId,
        name: team.name,
        shortName: null,
        logoUrl: null,
        color: null,
        isActive: true,
        discordRoleId: null
      })),
    rounds: async () => [],
    matches: async () => matches
  };
  const repository = new Proxy(source, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(property));
        return Reflect.apply(value, target, args);
      };
    }
  });
  return { repository, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

test('Team metadata issues the same queries regardless of the completed matches', async () => {
  const counts = [];
  for (const completedMatches of [1, 20]) {
    const { repository, calls } = countingRepository(completedMatches);
    const service = new PageMetadataService(new CompetitionService(repository));
    expect((await service.resolve('/equipos/rebels')).metadata).toEqual({
      title: 'Rebels',
      description: 'Conoce la plantilla de Rebels en Primera, temporada 2026 de Rebel Crown Legacy.'
    });
    counts.push(calls.length);
  }
  expect(counts[1]).toBe(counts[0]);
});

test('Detail metadata keeps the same texts when resolved from the repository', async () => {
  const { repository } = countingRepository(1);
  const service = new PageMetadataService(new CompetitionService(repository));
  expect((await service.resolve(`/jugadores/${playerId}`)).metadata).toEqual({
    title: 'Player#EUW',
    description:
      'Consulta el perfil, los equipos y las estadísticas de Player#EUW en Rebel Crown Legacy.'
  });
  expect(await service.resolve('/jugadores/player-euw')).toEqual(
    await service.resolve(`/jugadores/${playerId}`)
  );
  expect((await service.resolve(`/partidos/${matchId(0)}`)).metadata).toEqual({
    title: 'Rebels vs Crown',
    description:
      'Rebels 2–1 Crown. Consulta los mapas y las estadísticas de esta serie de Primera en Rebel Crown Legacy.'
  });
  expect(await service.resolve('/partidos/rebels-vs-crown')).toEqual(
    await service.resolve(`/partidos/${matchId(0)}`)
  );
  for (const path of ['/equipos/missing', '/jugadores/missing', '/partidos/missing'])
    expect(await service.resolve(path)).toEqual({
      metadata: getPageMetadata('/404'),
      found: false
    });
  expect((await service.resolve('/equipos/rebels')).found).toBe(true);
  expect(await service.resolve(`/equipos/${homeId.toUpperCase()}`)).toEqual(
    await service.resolve('/equipos/rebels')
  );
  expect(await service.resolve(`/jugadores/${playerId.toUpperCase()}`)).toEqual(
    await service.resolve(`/jugadores/${playerId}`)
  );
  expect(await service.resolve(`/partidos/${matchId(0).toUpperCase()}`)).toEqual(
    await service.resolve(`/partidos/${matchId(0)}`)
  );
});

test('Repeated metadata requests within the TTL query the repository once', async () => {
  vi.useFakeTimers();
  const { repository, calls } = countingRepository(3);
  const service = new PageMetadataService(new CompetitionService(repository), undefined, {
    cacheTtlMs: 60_000
  });
  const first = await service.resolve('/equipos/rebels');
  const teamQueries = calls.length;
  expect(teamQueries).toBeGreaterThan(0);
  expect(await service.resolve('/equipos/rebels')).toEqual(first);
  expect(calls.length).toBe(teamQueries);
  await service.resolve(`/partidos/${matchId(1)}`);
  const afterMatch = calls.length;
  await service.resolve(`/partidos/${matchId(1)}`);
  await service.resolve('/equipos/rebels');
  expect(calls.length).toBe(afterMatch);
  vi.advanceTimersByTime(60_001);
  await service.resolve('/equipos/rebels');
  expect(calls.length).toBe(afterMatch + teamQueries);
});

test('Concurrent metadata requests share one lookup', async () => {
  const single = countingRepository(1);
  await new PageMetadataService(new CompetitionService(single.repository)).resolve(
    '/equipos/rebels'
  );
  const { repository, calls } = countingRepository(1);
  const service = new PageMetadataService(new CompetitionService(repository));
  const [first, second] = await Promise.all([
    service.resolve('/equipos/rebels'),
    service.resolve('/equipos/rebels')
  ]);
  expect(second).toEqual(first);
  expect(calls.length).toBe(single.calls.length);
});

test('Failed metadata lookups are not cached', async () => {
  const lookup = vi
    .fn()
    .mockRejectedValueOnce(new Error('Database unavailable'))
    .mockResolvedValue({ title: 'Final', excerpt: 'Resumen.' });
  const service = new PageMetadataService(competition(), { article: lookup });
  await expect(service.resolve('/editorial/final')).rejects.toThrow('Database unavailable');
  expect((await service.resolve('/editorial/final')).metadata.description).toBe('Resumen.');
  expect(lookup).toHaveBeenCalledTimes(2);
});

test('Match metadata only describes completed or forfeited series', async () => {
  const { repository } = countingRepository(4, ['scheduled', 'live', 'cancelled', 'forfeit']);
  const service = new PageMetadataService(new CompetitionService(repository));
  for (const index of [0, 1, 2])
    expect((await service.resolve(`/partidos/${matchId(index)}`)).metadata.title).toBe(
      'Página no encontrada'
    );
  expect((await service.resolve(`/partidos/${matchId(3)}`)).metadata.title).toBe('Rebels vs Crown');
});

test('The metadata cache keeps at most the configured entries and drops the oldest', async () => {
  const { repository, calls } = countingRepository(1);
  const service = new PageMetadataService(new CompetitionService(repository), undefined, {
    cacheMaxEntries: 2
  });
  const lookups = async (path: string) => {
    const before = calls.length;
    await service.resolve(path);
    return calls.length - before;
  };
  const team = await lookups('/equipos/rebels');
  expect(team).toBeGreaterThan(0);
  expect(await lookups(`/jugadores/${playerId}`)).toBeGreaterThan(0);
  expect(await lookups('/equipos/rebels')).toBe(0);
  // A third path evicts the oldest entry (the team) and keeps the player.
  expect(await lookups(`/partidos/${matchId(0)}`)).toBeGreaterThan(0);
  expect(await lookups(`/jugadores/${playerId}`)).toBe(0);
  expect(await lookups('/equipos/rebels')).toBe(team);
});
