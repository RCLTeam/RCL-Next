import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { expect, test, vi } from 'vitest';
import { notFound } from '../../shared/app-error.js';
import { pageMetadataRouter, webPageRouter } from './page-metadata.router.js';
import { PageMetadataService } from './page-metadata.service.js';

const competition = () => ({ teamDetail: vi.fn(), playerDetail: vi.fn(), matchDetail: vi.fn() });

test('Detail metadata includes the record and only requests its resource', async () => {
  const source = competition();
  source.teamDetail.mockResolvedValue({
    name: 'Rebels',
    divisionName: 'Primera',
    seasonName: '2026'
  });
  source.playerDetail.mockResolvedValue({ gameName: 'Player', riotTag: 'EUW' });
  source.matchDetail.mockResolvedValue({
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
  expect((await service.resolve('/equipos/rebels/')).description).toContain('Rebels en Primera');
  expect(source.teamDetail).toHaveBeenCalledWith('rebels');
  expect((await service.resolve('/jugadores/player')).description).toContain('Player#EUW');
  expect((await service.resolve('/partidos/final')).description).toContain('A 2–1 B');
  expect((await service.resolve('/editorial/article')).description).toBe(
    'Así se decidió la corona.'
  );
  source.teamDetail.mockRejectedValue(notFound('Team'));
  expect((await service.resolve('/equipos/missing')).title).toBe('Página no encontrada');
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
