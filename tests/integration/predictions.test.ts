import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expect, test, vi } from 'vitest';
import { PredictionsRepository } from '../../apps/api/src/modules/predictions/predictions.repository.js';
import * as schema from '../../packages/database/src/schema.js';

test('predictions persist, hide votes until close, reject late edits and derive the ranking', async () => {
  const client = new PGlite();
  try {
    const db = drizzle(client, { schema });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
    await client.exec(
      await readFile(new URL('../../packages/database/seed/demo.sql', import.meta.url), 'utf8')
    );
    await client.exec(
      "UPDATE matches SET scheduled_at = '2026-10-02T18:00:00Z', status = 'scheduled', best_of = 3, winner_team_id = NULL; DELETE FROM predictions;"
    );
    await client.exec(
      'UPDATE teams SET discord_role_id = numbered.role_id FROM (SELECT id, row_number() OVER (ORDER BY id) AS role_id FROM teams) numbered WHERE teams.id = numbered.id'
    );
    const repository = new PredictionsRepository(db);
    const division = '20000000-0000-4000-8000-000000000001';
    const matchId = '70000000-0000-4000-8000-000000000001';
    const userId = '900000000000000001';
    const pick = {
      matchId,
      selectedTeamId: '30000000-0000-4000-8000-000000000001',
      homeScore: 2,
      awayScore: 0
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
    await expect(repository.save(userId, { ...pick, homeScore: 1 })).rejects.toMatchObject({
      code: 'INVALID_SCORE'
    });
    await expect(
      repository.save(userId, { ...pick, selectedTeamId: '30000000-0000-4000-8000-000000000003' })
    ).rejects.toMatchObject({ code: 'INVALID_TEAM' });
    await repository.save(userId, pick);
    await repository.save(userId, { ...pick, awayScore: 1 });
    expect(await repository.mine(division, userId)).toEqual([{ ...pick, awayScore: 1 }]);
    const open = await repository.overview(division);
    expect(open.matches[0]).toMatchObject({ open: true, homePercent: null, votes: null });
    const [scheduledMatch] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId));
    if (!scheduledMatch) throw new Error('Missing match fixture');
    for (const teamId of [scheduledMatch.team1Id, scheduledMatch.team2Id]) {
      if (!teamId) throw new Error('Missing participant fixture');
      const [original] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
      if (!original) throw new Error('Missing team fixture');
      for (const discordRoleId of [-9000n, -11n, -10n, -1n, null]) {
        await db.update(schema.teams).set({ discordRoleId }).where(eq(schema.teams.id, teamId));
        await expect(repository.save(userId, pick)).rejects.toMatchObject({
          code: 'INACTIVE_TEAMS'
        });
        expect(
          (await repository.overview(division)).matches.some((m) => m.matchId === matchId)
        ).toBe(false);
        expect(await repository.mine(division, userId)).toEqual([{ ...pick, awayScore: 1 }]);
        await db.delete(schema.predictions);
        await expect(repository.save(userId, pick)).rejects.toMatchObject({
          code: 'INACTIVE_TEAMS'
        });
        expect(await repository.mine(division, userId)).toEqual([]);
        await db
          .update(schema.teams)
          .set({ discordRoleId: original.discordRoleId })
          .where(eq(schema.teams.id, teamId));
        await repository.save(userId, { ...pick, awayScore: 1 });
      }
      await db.update(schema.teams).set({ discordRoleId: 0n }).where(eq(schema.teams.id, teamId));
      await repository.save(userId, { ...pick, awayScore: 1 });
      expect(
        (await repository.overview(division)).matches.find((m) => m.matchId === matchId)?.open
      ).toBe(true);
      await db
        .update(schema.teams)
        .set({ discordRoleId: original.discordRoleId })
        .where(eq(schema.teams.id, teamId));
    }
    vi.setSystemTime(new Date('2026-09-29T22:00:00Z'));
    await repository.save(userId, { ...pick, awayScore: 1 });
    expect((await repository.overview(division)).open).toBe(true);
    vi.setSystemTime(new Date('2026-10-02T16:59:59.999Z'));
    await repository.save(userId, { ...pick, awayScore: 1 });
    expect((await repository.overview(division)).matches[0]).toMatchObject({
      open: true,
      closed: false,
      votes: null,
      homePercent: null
    });
    vi.setSystemTime(new Date('2026-10-02T17:00:00Z'));
    expect((await repository.overview(division)).open).toBe(false);
    await expect(repository.save(userId, pick)).rejects.toMatchObject({
      code: 'PREDICTIONS_CLOSED'
    });
    expect((await repository.overview(division)).matches[0]).toMatchObject({
      open: false,
      closed: true,
      homePercent: 100,
      votes: 1
    });
    await client.exec(
      `UPDATE matches SET status = 'completed', winner_team_id = team1_id, team1_score = 2, team2_score = 1 WHERE id = '${matchId}'`
    );
    expect((await repository.overview(division)).ranking[0]).toMatchObject({
      userId,
      points: 3,
      correct: 1,
      total: 1,
      position: 1
    });
    await client.exec(`UPDATE matches SET team2_score = 0 WHERE id = '${matchId}'`);
    expect((await repository.overview(division)).ranking[0]?.points).toBe(1);
  } finally {
    vi.useRealTimers();
    await client.close();
  }
}, 30000);
