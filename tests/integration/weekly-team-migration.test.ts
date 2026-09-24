import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

test('round migration preserves the previous selection without inventing a round', async () => {
  const client = new PGlite();
  try {
    for (const file of ['0000_initial_schema.sql', '0001_home_content.sql']) {
      await client.exec(
        await readFile(new URL(`../../packages/database/drizzle/${file}`, import.meta.url), 'utf8')
      );
    }
    await client.exec(
      `INSERT INTO seasons(name) VALUES ('Season'); INSERT INTO divisions(name) VALUES ('Premier'); INSERT INTO seasons_divisions(id, season_name, division_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Season', 'Premier'); INSERT INTO home_weekly_teams(division_id, label, published, players) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Original selection', true, '[]');`
    );
    await client.exec(
      await readFile(
        new URL('../../packages/database/drizzle/0002_weekly_team_rounds.sql', import.meta.url),
        'utf8'
      )
    );
    const result = await client.query<{
      label: string;
      round_id: number | null;
      id: string;
      published: boolean;
    }>('SELECT * FROM home_weekly_teams');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      label: 'Original selection',
      round_id: null,
      published: true
    });
    expect(result.rows[0]?.id).toMatch(/^[a-f0-9-]{36}$/);
  } finally {
    await client.close();
  }
});
