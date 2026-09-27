import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

test('showcase is complete, consistent and safe to rerun', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile('packages/database/drizzle/0000_initial_schema.sql', 'utf8'));
    const base = await readFile('packages/database/seed/demo.sql', 'utf8');
    const extra = await readFile('packages/database/seed/showcase.sql', 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(base);
      await tx.exec(extra);
    });
    const snapshot = async () =>
      (await db.query<Record<string, unknown>>('SELECT * FROM player_game_stats ORDER BY id')).rows;
    const before = await snapshot();
    await db.transaction(async (tx) => {
      await tx.exec(base);
      await tx.exec(extra);
    });
    expect(await snapshot()).toEqual(before);
    expect(before).toHaveLength(240);
    for (const row of before) expect(Object.values(row)).not.toContain(null);
    expect(
      (
        await db.query(
          'SELECT g.id FROM match_games g LEFT JOIN player_game_info i ON i.match_game_id=g.id GROUP BY g.id HAVING count(i.id) <> 10'
        )
      ).rows
    ).toEqual([]);
    expect(
      (
        await db.query(
          'SELECT g.id FROM match_games g JOIN player_game_info i ON i.match_game_id=g.id JOIN player_game_stats s ON s.id=i.id GROUP BY g.id HAVING sum(s.kills) <> sum(s.deaths)'
        )
      ).rows
    ).toEqual([]);
    expect(
      (
        await db.query(
          `SELECT m.id FROM matches m LEFT JOIN match_games g ON g.matches_id=m.id WHERE m.status='completed' GROUP BY m.id HAVING count(*) FILTER (WHERE g.winner_team_id=m.team1_id) <> m.team1_score OR count(*) FILTER (WHERE g.winner_team_id=m.team2_id) <> m.team2_score`
        )
      ).rows
    ).toEqual([]);
    await db.exec(
      `UPDATE player_game_stats SET gold_earned=99999 WHERE id='a0000000-0000-4000-8000-000000000001'`
    );
    await db.exec(extra);
    expect(
      (
        await db.query<{ gold_earned: number }>(
          `SELECT gold_earned FROM player_game_stats WHERE id='a0000000-0000-4000-8000-000000000001'`
        )
      ).rows[0]?.gold_earned
    ).toBe(99999);
  } finally {
    await db.close();
  }
}, 30000);
