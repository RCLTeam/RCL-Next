import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
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
    vi.setSystemTime(new Date('2026-09-29T22:00:00Z'));
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
