import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expect, test, vi } from 'vitest';
import { PredictionsRepository } from '../../apps/api/src/modules/predictions/predictions.repository.js';
import * as schema from '../../packages/database/src/schema.js';

const division = '20000000-0000-4000-8000-000000000001';

async function seedDatabase(client: PGlite) {
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
  // Round 1 is the week of 2026-09-28 and round 2 the week of 2026-10-05 (Madrid).
  await client.exec(
    `UPDATE rounds SET starts_at = CASE id WHEN 1 THEN timestamptz '2026-09-27T22:00:00Z' ELSE timestamptz '2026-10-04T22:00:00Z' END WHERE id_season_division = '${division}'`
  );
  return { db, repository: new PredictionsRepository(db) };
}

test('predictions persist, hide votes until completion, reject late edits and derive the ranking', async () => {
  const client = new PGlite();
  try {
    const { db, repository } = await seedDatabase(client);
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
      homePercent: null,
      votes: null
    });
    vi.setSystemTime(new Date('2026-10-02T18:30:00Z'));
    await db
      .update(schema.matches)
      .set({ scheduledAt: new Date('2026-10-02T21:00:00Z') })
      .where(eq(schema.matches.id, matchId));
    expect(
      (await repository.overview(division)).matches.find((m) => m.matchId === matchId)
    ).toMatchObject({ open: true, closed: false, votes: null, homePercent: null });
    await repository.save(userId, { ...pick, awayScore: 1 });
    await db.update(schema.matches).set({ status: 'live' }).where(eq(schema.matches.id, matchId));
    expect(
      (await repository.overview(division)).matches.find((m) => m.matchId === matchId)
    ).toMatchObject({ open: false, closed: true, votes: null, homePercent: null });
    await expect(repository.save(userId, pick)).rejects.toMatchObject({
      code: 'PREDICTIONS_CLOSED'
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
    for (const status of ['completed', 'forfeit'] as const) {
      await db.update(schema.matches).set({ status }).where(eq(schema.matches.id, matchId));
      expect(
        (await repository.overview(division)).matches.find((m) => m.matchId === matchId)
      ).toMatchObject({ open: false, closed: true, votes: 1, homePercent: 100 });
    }
    await client.exec(`UPDATE matches SET team2_score = 0 WHERE id = '${matchId}'`);
    expect((await repository.overview(division)).ranking[0]?.points).toBe(1);
  } finally {
    vi.useRealTimers();
    await client.close();
  }
}, 30000);

test('overview lists the selected round, defaults to the current one and follows id_round', async () => {
  const client = new PGlite();
  try {
    const { repository } = await seedDatabase(client);
    const first = '70000000-0000-4000-8000-000000000001';
    const second = '70000000-0000-4000-8000-000000000002';
    await client.exec(
      `UPDATE matches SET status = 'completed', winner_team_id = team1_id, team1_score = 2, team2_score = 0, scheduled_at = '2026-10-04T18:00:00Z' WHERE id = '${first}';
       UPDATE matches SET scheduled_at = '2026-10-09T18:00:00Z' WHERE id = '${second}';
       INSERT INTO predictions (discord_user_id, match_id, selected_team_id, home_score, away_score)
       VALUES ('900000000000000001', '${first}', (SELECT team1_id FROM matches WHERE id = '${first}'), 2, 0);`
    );
    const monday = new Date('2026-10-05T08:00:00Z');

    const current = await repository.overview(division, { now: monday });
    expect(current).toMatchObject({ round: '2', currentRound: '2', open: true });
    expect(current.matches).toEqual([
      { matchId: second, open: true, closed: false, votes: null, homePercent: null }
    ]);

    // Sunday results stay visible on Monday from the previous round.
    const previous = await repository.overview(division, { roundId: 1, now: monday });
    expect(previous).toMatchObject({ round: '1', currentRound: '2' });
    expect(previous.matches).toEqual([
      { matchId: first, open: false, closed: true, votes: 1, homePercent: 100 }
    ]);
    expect(previous.ranking[0]).toMatchObject({ userId: '900000000000000001', points: 3 });

    // A postponed match stays in its round and is voted from that round's view.
    await client.exec(
      `UPDATE matches SET status = 'scheduled', winner_team_id = NULL, team1_score = 0, team2_score = 0, scheduled_at = '2026-10-08T18:00:00Z' WHERE id = '${first}'`
    );
    expect((await repository.overview(division, { roundId: 1, now: monday })).matches).toEqual([
      { matchId: first, open: true, closed: false, votes: null, homePercent: null }
    ]);
    expect(
      (await repository.overview(division, { now: monday })).matches.map((m) => m.matchId)
    ).toEqual([second]);

    // Matches without a round are never listed.
    await client.exec(`UPDATE matches SET id_round = NULL WHERE id = '${second}'`);
    for (const options of [
      { now: monday },
      { roundId: 1, now: monday },
      { roundId: 2, now: monday }
    ])
      expect(
        (await repository.overview(division, options)).matches.some((m) => m.matchId === second)
      ).toBe(false);

    // Break week: the last started round is still the current one.
    expect(
      await repository.overview(division, { now: new Date('2026-10-14T10:00:00Z') })
    ).toMatchObject({ round: '2', currentRound: '2' });

    // Before the first round there is nothing to show.
    expect(
      await repository.overview(division, { now: new Date('2026-09-20T10:00:00Z') })
    ).toMatchObject({ round: null, currentRound: null, matches: [] });

    for (const [divisionId, roundId] of [
      [division, 99],
      ['20000000-0000-4000-8000-000000000002', 2]
    ] as const)
      await expect(repository.overview(divisionId, { roundId, now: monday })).rejects.toMatchObject(
        {
          statusCode: 404,
          code: 'NOT_FOUND'
        }
      );
  } finally {
    await client.close();
  }
}, 30000);
