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
    it('queries active teams and maps id and updatedAt correctly', async () => {
      const updatedDate = new Date('2026-09-01T10:00:00Z');
      const mockRows = [
        { id: 'team-uuid-1', updatedAt: updatedDate, createdAt: new Date('2026-08-01T10:00:00Z') },
        { id: 'team-uuid-2', updatedAt: updatedDate, createdAt: new Date('2026-08-01T10:00:00Z') }
      ];

      const whereFn = vi.fn().mockResolvedValue(mockRows);
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      const mockDb = { select: selectFn };

      const repo = new PostgresSitemapRepository(mockDb as never);
      const result = await repo.getTeams();

      expect(selectFn).toHaveBeenCalledOnce();
      expect(fromFn).toHaveBeenCalledWith(teams);
      expect(whereFn).toHaveBeenCalledOnce();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'team-uuid-1',
        updatedAt: updatedDate
      });
      expect(result[1]).toEqual({
        id: 'team-uuid-2',
        updatedAt: updatedDate
      });
    });

    it('falls back to createdAt when updatedAt is nullish', async () => {
      const createdDate = new Date('2026-07-15T08:00:00Z');
      const mockRows = [{ id: 'team-uuid-fallback', updatedAt: null, createdAt: createdDate }];

      const whereFn = vi.fn().mockResolvedValue(mockRows);
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      const mockDb = { select: selectFn };

      const repo = new PostgresSitemapRepository(mockDb as never);
      const result = await repo.getTeams();

      expect(result).toEqual([
        {
          id: 'team-uuid-fallback',
          updatedAt: createdDate
        }
      ]);
    });

    it('propagates database query errors', async () => {
      const whereFn = vi.fn().mockRejectedValue(new Error('DB query timeout'));
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const selectFn = vi.fn().mockReturnValue({ from: fromFn });
      const mockDb = { select: selectFn };

      const repo = new PostgresSitemapRepository(mockDb as never);
      await expect(repo.getTeams()).rejects.toThrow('DB query timeout');
    });
  });

  describe('getPlayers()', () => {
    it('queries all players and maps id and updatedAt correctly', async () => {
      const updatedDate = new Date('2026-09-10T12:00:00Z');
      const mockRows = [
        {
          id: 'player-uuid-1',
          updatedAt: updatedDate,
          createdAt: new Date('2026-08-01T10:00:00Z')
        },
        {
          id: 'player-uuid-2',
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
      expect(result[0]).toEqual({
        id: 'player-uuid-1',
        updatedAt: updatedDate
      });
      expect(result[1]).toEqual({
        id: 'player-uuid-2',
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

  it('getTeams() returns only active teams, excluding inactive teams', async () => {
    const [activeTeam] = await db
      .insert(teams)
      .values({
        name: 'Active Team Alpha',
        seasonDivisionId: divisionId,
        isActive: true
      })
      .returning({ id: teams.id, updatedAt: teams.updatedAt });

    expect(activeTeam).toBeDefined();
    if (!activeTeam) throw new Error('Active team insert failed');

    await db.insert(teams).values({
      name: 'Inactive Team Beta',
      seasonDivisionId: divisionId,
      isActive: false
    });

    const result = await repo.getTeams();
    const teamIds = result.map((t) => t.id);

    expect(teamIds).toContain(activeTeam.id);
    const activeItem = result.find((t) => t.id === activeTeam.id);
    expect(activeItem?.updatedAt).toBeInstanceOf(Date);

    // Verify no inactive teams returned
    const inactiveFound = result.find((t) => t.id !== activeTeam.id && teamIds.includes(t.id));
    if (inactiveFound) {
      // In case other tests added teams, verify the inactive team specifically is not present
      const allInactive = await db.select().from(teams).where(eq(teams.isActive, false));
      const inactiveIds = allInactive.map((i) => i.id);
      for (const item of result) {
        expect(inactiveIds).not.toContain(item.id);
      }
    }
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

    expect(found).toBeDefined();
    expect(found?.id).toBe(player.id);
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
