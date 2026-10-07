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

test('overview aggregates the season ranking and the shown round percentages', async () => {
  const client = new PGlite();
  try {
    const { repository } = await seedDatabase(client);
    const team = (suffix: string) => `30000000-0000-4000-8000-00000000000${suffix}`;
    const [t1, t3, t4, t5, t6, t7, ta, tb] = ['1', '3', '4', '5', '6', '7', 'a', 'b'].map(team);
    const otherDivision = '20000000-0000-4000-8000-000000000009';
    const m = (n: number) => `70000000-0000-4000-8000-00000000000${n}`;
    const u = (n: number) => `90000000000000000${n}`;
    await client.exec(`
      INSERT INTO seasons (name, starts_on, ends_on) VALUES ('Otra temporada', '2051-01-01', '2051-12-31');
      INSERT INTO seasons_divisions (id, season_name, division_name)
        VALUES ('${otherDivision}', 'Otra temporada', 'Premier DEMO');
      INSERT INTO teams (id, season_division_id, name, short_name, color, discord_role_id) VALUES
        ('${t5}', '${division}', 'Retirados', 'RET', '#000000', -10),
        ('${ta}', '${division}', 'Activos A', 'ACA', '#000000', 8),
        ('${tb}', '${division}', 'Activos B', 'ACB', '#000000', 9),
        ('${t6}', '${otherDivision}', 'Otros', 'OTR', '#000000', 6),
        ('${t7}', '${otherDivision}', 'Otros 2', 'OT2', '#000000', 7);
      INSERT INTO matches (id, id_season_division, id_round, team1_id, team2_id, best_of, status, scheduled_at) VALUES
        ('${m(4)}', '${division}', 1, '${t1}', '${ta}', 3, 'scheduled', '2026-10-02T18:00:00Z'),
        ('${m(5)}', '${division}', 1, '${t1}', '${tb}', 3, 'scheduled', '2026-10-02T18:00:00Z'),
        ('${m(6)}', '${division}', 1, '${t1}', '${t5}', 3, 'scheduled', '2026-10-02T18:00:00Z'),
        ('${m(7)}', '${otherDivision}', NULL, '${t6}', '${t7}', 3, 'scheduled', '2026-10-02T18:00:00Z'),
        ('${m(8)}', '${division}', 1, '${ta}', '${tb}', 3, 'scheduled', '2026-10-02T18:00:00Z');
      UPDATE matches SET status = 'completed', winner_team_id = team1_id, team1_score = 2, team2_score = 1 WHERE id = '${m(1)}';
      UPDATE matches SET status = 'completed', winner_team_id = team2_id, team1_score = 0, team2_score = 2 WHERE id = '${m(3)}';
      UPDATE matches SET status = 'forfeit', winner_team_id = team2_id, team1_score = 0, team2_score = 2 WHERE id = '${m(4)}';
      UPDATE matches SET status = 'completed' WHERE id = '${m(5)}';
      UPDATE matches SET status = 'completed', winner_team_id = team1_id, team1_score = 2, team2_score = 0 WHERE id IN ('${m(6)}', '${m(7)}', '${m(8)}');
      UPDATE discord_users SET global_name = 'Zeta', avatar_hash = 'a1' WHERE discord_id = '${u(1)}';
      UPDATE discord_users SET global_name = 'Alfa' WHERE discord_id IN ('${u(3)}', '${u(4)}');
      INSERT INTO predictions (discord_user_id, match_id, selected_team_id, home_score, away_score) VALUES
        ('${u(1)}', '${m(1)}', '${t1}', 2, 1),
        ('${u(1)}', '${m(3)}', '${t4}', 0, 2),
        ('${u(1)}', '${m(4)}', '${t1}', 2, 0),
        ('${u(1)}', '${m(5)}', '${t1}', NULL, NULL),
        ('${u(1)}', '${m(2)}', '${t1}', 0, 2),
        ('${u(2)}', '${m(1)}', '${t1}', 2, 0),
        ('${u(2)}', '${m(4)}', '${ta}', 0, 2),
        ('${u(2)}', '${m(6)}', '${t1}', NULL, NULL),
        ('${u(2)}', '${m(7)}', '${t6}', 2, 0),
        ('${u(3)}', '${m(1)}', '${team('2')}', 1, 2),
        ('${u(3)}', '${m(3)}', '${t4}', NULL, NULL),
        ('${u(3)}', '${m(4)}', '${ta}', 1, 2),
        ('${u(3)}', '${m(6)}', '${t1}', 2, 0),
        ('${u(4)}', '${m(1)}', '${t1}', 2, 1),
        ('${u(4)}', '${m(4)}', '${ta}', NULL, NULL),
        ('${u(4)}', '${m(6)}', '${t1}', 2, 1),
        ('${u(5)}', '${m(2)}', '${t1}', NULL, NULL),
        ('${u(5)}', '${m(5)}', '${tb}', NULL, NULL),
        ('${u(5)}', '${m(7)}', '${t6}', NULL, NULL),
        ('${u(6)}', '${m(1)}', '${team('2')}', NULL, NULL),
        ('${u(6)}', '${m(5)}', '${t1}', 2, 0);
    `);
    const options = { roundId: 1, now: new Date('2026-10-05T08:00:00Z') };
    const overview = await repository.overview(division, options);
    expect(overview).toMatchObject({ round: '1', currentRound: '2', open: false });
    expect([...overview.matches].sort((a, b) => a.matchId.localeCompare(b.matchId))).toEqual([
      { matchId: m(1), open: false, closed: true, votes: 5, homePercent: 60 },
      { matchId: m(4), open: false, closed: true, votes: 4, homePercent: 25 },
      { matchId: m(5), open: false, closed: true, votes: 3, homePercent: 67 },
      { matchId: m(8), open: false, closed: true, votes: 0, homePercent: null }
    ]);
    const standing = (
      n: number,
      name: string,
      position: number,
      correct: number,
      total: number,
      points: number,
      avatarHash: string | null = null
    ) => ({ userId: u(n), name, avatarHash, position, correct, total, points });
    expect(overview.ranking).toEqual([
      standing(1, 'Zeta', 1, 2, 3, 6, 'a1'),
      standing(3, 'Alfa', 2, 3, 4, 5),
      standing(4, 'Alfa', 3, 3, 3, 5),
      standing(2, 'Jugador Discord DEMO 2', 4, 3, 3, 5),
      standing(6, 'Jugador Discord DEMO 6', 5, 0, 1, 0)
    ]);

    // Rows read per request depend on ranked users and shown matches, not on season votes.
    const query = client.query.bind(client);
    let rowsRead = 0;
    vi.spyOn(client, 'query').mockImplementation(async (...args: Parameters<typeof query>) => {
      const result = await query(...args);
      rowsRead += result.rows.length;
      return result;
    });
    const readRows = async () => {
      rowsRead = 0;
      await repository.overview(division, options);
      return rowsRead;
    };
    const before = await readRows();
    const extra = Array.from(
      { length: 10 },
      (_, i) => `71000000-0000-4000-8000-0000000000${10 + i}`
    ).join("','");
    await client.exec(`
      INSERT INTO matches (id, id_season_division, id_round, team1_id, team2_id, best_of, status, team1_score, team2_score, winner_team_id, scheduled_at)
      SELECT id::uuid, '20000000-0000-4000-8000-000000000002', NULL, '${t3}', '${t4}', 3, 'completed', 2, 0, '${t3}', '2026-10-02T18:00:00Z'
      FROM unnest(ARRAY['${extra}']) AS id;
      INSERT INTO predictions (discord_user_id, match_id, selected_team_id)
      SELECT users.id, extra.id::uuid, '${t3}'
      FROM unnest(ARRAY['${extra}']) AS extra(id)
      CROSS JOIN unnest(ARRAY['${u(1)}', '${u(2)}', '${u(3)}', '${u(4)}', '${u(6)}']) AS users(id);
    `);
    expect(await readRows()).toBe(before);
    expect((await repository.overview(division, options)).ranking[0]).toMatchObject({
      userId: u(1),
      total: 13,
      correct: 12,
      points: 16
    });
  } finally {
    vi.restoreAllMocks();
    await client.close();
  }
}, 30000);
