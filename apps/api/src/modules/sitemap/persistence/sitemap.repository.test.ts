import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  divisions,
  editorialArticles,
  players,
  seasons,
  seasonsDivisions,
  teams
} from '@rcl/database';
import * as schema from '@rcl/database/schema';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PostgresSitemapRepository } from './postgres-sitemap.repository.js';
import type { SitemapRepository } from './sitemap.repository.js';

describe('PostgresSitemapRepository with mocked DB', () => {
  it('implements SitemapRepository interface', () => {
    const mockDb = {
      select: vi.fn()
    };
    const repo: SitemapRepository = new PostgresSitemapRepository(mockDb as never);
    expect(repo).toBeDefined();
    expect(typeof repo.getTeams).toBe('function');
    expect(typeof repo.getPlayers).toBe('function');
    expect(typeof repo.getArticles).toBe('function');
  });

  describe('getTeams()', () => {
    const teamRow = (id: string, updatedAt: Date | null, createdAt: Date) => ({
      id,
      name: `Team ${id}`,
      seasonName: 'Season',
      divisionName: 'Division',
      isActive: true,
      updatedAt,
      createdAt
    });
    const mockTeamsDb = (result: Promise<unknown>) => {
      const innerJoinFn = vi.fn().mockReturnValue(result);
      const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      return { db: { select: selectFn }, selectFn, fromFn, innerJoinFn };
    };

    it('queries the whole team directory joined with its season and division', async () => {
      const updatedDate = new Date('2026-09-01T10:00:00Z');
      const created = new Date('2026-08-01T10:00:00Z');
      const { db, selectFn, fromFn, innerJoinFn } = mockTeamsDb(
        Promise.resolve([
          teamRow('team-uuid-1', updatedDate, created),
          { ...teamRow('team-uuid-2', updatedDate, created), isActive: false }
        ])
      );

      const repo = new PostgresSitemapRepository(db as never);
      const result = await repo.getTeams();

      expect(selectFn).toHaveBeenCalledOnce();
      expect(fromFn).toHaveBeenCalledWith(teams);
      expect(innerJoinFn).toHaveBeenCalledOnce();
      expect(innerJoinFn.mock.calls[0]?.[0]).toBe(seasonsDivisions);
      expect(result).toEqual([
        {
          id: 'team-uuid-1',
          name: 'Team team-uuid-1',
          seasonName: 'Season',
          divisionName: 'Division',
          isActive: true,
          updatedAt: updatedDate
        },
        {
          id: 'team-uuid-2',
          name: 'Team team-uuid-2',
          seasonName: 'Season',
          divisionName: 'Division',
          isActive: false,
          updatedAt: updatedDate
        }
      ]);
    });

    it('falls back to createdAt when updatedAt is nullish', async () => {
      const createdDate = new Date('2026-07-15T08:00:00Z');
      const { db } = mockTeamsDb(
        Promise.resolve([teamRow('team-uuid-fallback', null, createdDate)])
      );

      const repo = new PostgresSitemapRepository(db as never);
      const [result] = await repo.getTeams();

      expect(result?.updatedAt).toEqual(createdDate);
    });

    it('propagates database query errors', async () => {
      const { db } = mockTeamsDb(Promise.reject(new Error('DB query timeout')));

      const repo = new PostgresSitemapRepository(db as never);
      await expect(repo.getTeams()).rejects.toThrow('DB query timeout');
    });
  });

  describe('getPlayers()', () => {
    it('queries all players and maps id, name, tag and updatedAt correctly', async () => {
      const updatedDate = new Date('2026-09-10T12:00:00Z');
      const mockRows = [
        {
          id: 'player-uuid-1',
          gameName: 'Faker',
          riotTag: 'KR1',
          updatedAt: updatedDate,
          createdAt: new Date('2026-08-01T10:00:00Z')
        },
        {
          id: 'player-uuid-2',
          gameName: 'Caps',
          riotTag: null,
          updatedAt: updatedDate,
          createdAt: new Date('2026-08-01T10:00:00Z')
        }
      ];

      const fromFn = vi.fn().mockResolvedValue(mockRows);
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      const mockDb = { select: selectFn };

      const repo = new PostgresSitemapRepository(mockDb as never);
      const result = await repo.getPlayers();

      expect(selectFn).toHaveBeenCalledOnce();
      expect(fromFn).toHaveBeenCalledWith(players);
      expect(result).toHaveLength(2);
      expect(result[0]).toStrictEqual({
        id: 'player-uuid-1',
        gameName: 'Faker',
        riotTag: 'KR1',
        updatedAt: updatedDate
      });
      expect(result[1]).toStrictEqual({
        id: 'player-uuid-2',
        gameName: 'Caps',
        riotTag: null,
        updatedAt: updatedDate
      });
    });

    it('falls back to createdAt when player updatedAt is nullish', async () => {
      const createdDate = new Date('2026-06-20T11:00:00Z');
      const mockRows = [{ id: 'player-fallback', updatedAt: null, createdAt: createdDate }];

      const fromFn = vi.fn().mockResolvedValue(mockRows);
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      const mockDb = { select: selectFn };

      const repo = new PostgresSitemapRepository(mockDb as never);
      const result = await repo.getPlayers();

      expect(result).toEqual([
        {
          id: 'player-fallback',
          updatedAt: createdDate
        }
      ]);
    });

    it('propagates player query errors', async () => {
      const fromFn = vi.fn().mockRejectedValue(new Error('Connection terminated'));
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      const mockDb = { select: selectFn };

      const repo = new PostgresSitemapRepository(mockDb as never);
      await expect(repo.getPlayers()).rejects.toThrow('Connection terminated');
    });
  });

  describe('getArticles()', () => {
    it('queries published articles and maps id and updatedAt correctly', async () => {
      const updatedDate = new Date('2026-10-01T16:00:00Z');
      const mockRows = [
        { id: 'article-uuid-1', updatedAt: updatedDate },
        { id: 'article-uuid-2', updatedAt: updatedDate }
      ];

      const whereFn = vi.fn().mockResolvedValue(mockRows);
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      const mockDb = { select: selectFn };

      const repo = new PostgresSitemapRepository(mockDb as never);
      const result = await repo.getArticles();

      expect(selectFn).toHaveBeenCalledOnce();
      expect(fromFn).toHaveBeenCalledWith(editorialArticles);
      expect(whereFn).toHaveBeenCalledOnce();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'article-uuid-1',
        updatedAt: updatedDate
      });
      expect(result[1]).toEqual({
        id: 'article-uuid-2',
        updatedAt: updatedDate
      });
    });

    it('propagates article query errors', async () => {
      const whereFn = vi.fn().mockRejectedValue(new Error('Table lock timeout'));
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      const mockDb = { select: selectFn };

      const repo = new PostgresSitemapRepository(mockDb as never);
      await expect(repo.getArticles()).rejects.toThrow('Table lock timeout');
    });
  });
});

describe('PostgresSitemapRepository with in-memory PGlite database', () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  let repo: PostgresSitemapRepository;
  let divisionId: string;

  beforeAll(async () => {
    const migrationsFolder = fileURLToPath(
      new URL('../../../../../../packages/database/drizzle', import.meta.url)
    );
    await migrate(db, { migrationsFolder });
    repo = new PostgresSitemapRepository(db);

    await db.insert(seasons).values({ name: 'Sitemap Test Season' });
    await db.insert(divisions).values({ name: 'Division 1' });

    const [division] = await db
      .insert(seasonsDivisions)
      .values({
        seasonName: 'Sitemap Test Season',
        divisionName: 'Division 1'
      })
      .returning({ id: seasonsDivisions.id });

    if (!division) throw new Error('Division insert failed');
    divisionId = division.id;
  });

  afterAll(async () => {
    await client.close();
  });

  it('getTeams() returns active and inactive teams with their season, division and status', async () => {
    const [activeTeam] = await db
      .insert(teams)
      .values({ name: 'Active Team Alpha', seasonDivisionId: divisionId, isActive: true })
      .returning({ id: teams.id });
    const [inactiveTeam] = await db
      .insert(teams)
      .values({ name: 'Inactive Team Beta', seasonDivisionId: divisionId, isActive: false })
      .returning({ id: teams.id });
    if (!activeTeam || !inactiveTeam) throw new Error('Team insert failed');

    const result = await repo.getTeams();

    // Inactive teams are needed to compute the same slugs as the competition API.
    expect(result.find((team) => team.id === activeTeam.id)).toMatchObject({
      name: 'Active Team Alpha',
      seasonName: 'Sitemap Test Season',
      divisionName: 'Division 1',
      isActive: true
    });
    expect(result.find((team) => team.id === inactiveTeam.id)).toMatchObject({
      name: 'Inactive Team Beta',
      isActive: false
    });
    for (const team of result) expect(team.updatedAt).toBeInstanceOf(Date);
  });

  it('getPlayers() returns registered players with valid Date instances', async () => {
    const [player] = await db
      .insert(players)
      .values({
        gameName: 'FakerSitemap',
        riotTag: 'KR1'
      })
      .returning({ id: players.id, updatedAt: players.updatedAt });

    expect(player).toBeDefined();
    if (!player) throw new Error('Player insert failed');

    const result = await repo.getPlayers();
    const found = result.find((p) => p.id === player.id);

    expect(found).toMatchObject({ id: player.id, gameName: 'FakerSitemap', riotTag: 'KR1' });
    expect(found?.updatedAt).toBeInstanceOf(Date);
  });

  it('getArticles() returns only published editorial articles, excluding drafts', async () => {
    const [publishedArticle] = await db
      .insert(editorialArticles)
      .values({
        title: 'Published News Title',
        excerpt: 'Short excerpt',
        body: 'Full editorial body text',
        kind: 'noticia',
        author: 'Editor RCL',
        published: true
      })
      .returning({ id: editorialArticles.id, updatedAt: editorialArticles.updatedAt });

    const [draftArticle] = await db
      .insert(editorialArticles)
      .values({
        title: 'Draft Article Title',
        excerpt: 'Draft excerpt',
        body: 'Draft body text',
        kind: 'reportaje',
        author: 'Editor RCL',
        published: false
      })
      .returning({ id: editorialArticles.id });

    expect(publishedArticle).toBeDefined();
    expect(draftArticle).toBeDefined();
    if (!publishedArticle || !draftArticle) throw new Error('Article insert failed');

    const result = await repo.getArticles();
    const articleIds = result.map((a) => a.id);

    expect(articleIds).toContain(publishedArticle.id);
    expect(articleIds).not.toContain(draftArticle.id);

    const foundPublished = result.find((a) => a.id === publishedArticle.id);
    expect(foundPublished?.updatedAt).toBeInstanceOf(Date);
  });
});
