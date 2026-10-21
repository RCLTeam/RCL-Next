import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expect, onTestFinished, test } from 'vitest';
import { membershipIntegritySql } from '../../packages/database/src/membership-integrity.js';
import * as schema from '../../packages/database/src/schema.js';

const migrationsFolder = fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url));
const team = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
const membership = (n: number, role: string, legacy = false) =>
  `INSERT INTO team_memberships(team_id, discord_user_id, role${legacy ? '' : ', season_name'}) VALUES ('${team(n)}', 'player', '${role}'${legacy ? '' : `, '${n === 3 ? 'S2' : 'S1'}'`})`;

// Two divisions in S1 and a separate season S2.
async function fixtures(client: PGlite, legacy = false) {
  await client.exec(`
    INSERT INTO seasons(name) VALUES ('S1'), ('S2'), ('S3');
    INSERT INTO divisions(name) VALUES ('D1'), ('D2');
    INSERT INTO seasons_divisions(id, season_name, division_name) VALUES
      ('${team(1)}', 'S1', 'D1'), ('${team(2)}', 'S1', 'D2'), ('${team(3)}', 'S2', 'D1');
    INSERT INTO teams(id, season_division_id, name${legacy ? '' : ', season_name'})
      SELECT id, id, division_name${legacy ? '' : ', season_name'} FROM seasons_divisions;
    INSERT INTO discord_users(discord_id, username) VALUES ('player', 'Player');
  `);
}

test('read-only membership diagnostic distinguishes valid affiliations from corrupted imports', async (t) => {
  const client = new PGlite({ extensions: { btree_gist } });
  t.onTestFinished(() => client.close());
  await migrate(drizzle(client, { schema }), { migrationsFolder });
  await fixtures(client);
  await client.exec(membership(1, 'top'));
  await client.exec(membership(2, 'staff'));
  await client.exec(membership(3, 'substitute'));
  expect((await client.query(membershipIntegritySql)).rows).toEqual([]);
  // Simulate a broken import only in this disposable embedded database.
  await client.exec(`
    ALTER TABLE team_memberships DROP CONSTRAINT one_competitive_team_per_player_and_season;
    ALTER TABLE team_memberships DROP CONSTRAINT team_memberships_team_season_fkey;
    ALTER TABLE team_memberships DROP CONSTRAINT team_memberships_captain_role_check;
    UPDATE team_memberships SET role = 'mid', season_name = 'S3' WHERE team_id = '${team(2)}';
  `);
  const before = await client.query('SELECT * FROM team_memberships ORDER BY team_id');
  const report = await client.query<{ issue: string }>(membershipIntegritySql);
  expect(report.rows.map((row) => row.issue)).toEqual([
    'membership_season_mismatch',
    'multiple_competitive_teams'
  ]);
  expect(await client.query('SELECT * FROM team_memberships ORDER BY team_id')).toEqual(before);
  await client.exec(
    `UPDATE team_memberships SET role = 'coach', is_captain = true WHERE team_id = '${team(2)}'`
  );
  expect(
    (await client.query<{ issue: string }>(membershipIntegritySql)).rows.map((row) => row.issue)
  ).toContain('invalid_captain_role');
});

test('competitive membership is unique per season; other roles remain unrestricted', async (t) => {
  const client = new PGlite({ extensions: { btree_gist } });
  t.onTestFinished(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  await fixtures(client);
  await expect(client.exec(membership(1, 'top', true))).rejects.toMatchObject({ code: '23502' });
  await expect(
    client.exec(
      `INSERT INTO teams(season_division_id, name) VALUES ('${team(1)}', 'Missing season')`
    )
  ).rejects.toMatchObject({ code: '23502' });
  expect(
    (
      await client.query(
        `SELECT tgname FROM pg_trigger WHERE tgname IN ('derive_team_season_trigger', 'derive_membership_season_trigger')`
      )
    ).rows
  ).toEqual([]);
  await db.insert(schema.teamMemberships).values({
    teamId: team(1),
    discordUserId: 'player',
    role: 'top',
    seasonName: 'S1'
  });

  for (const role of ['top', 'jungle', 'mid', 'adc', 'support', 'substitute']) {
    await expect(client.exec(membership(2, role))).rejects.toMatchObject({
      code: '23P01',
      constraint: 'one_competitive_team_per_player_and_season'
    });
  }
  for (const role of ['coach', 'staff', 'partners']) {
    await client.exec(membership(2, role));
    await expect(
      client.exec(`UPDATE team_memberships SET role = 'mid'
      WHERE team_id = '${team(2)}'`)
    ).rejects.toMatchObject({ code: '23P01' });
    await client.exec(`DELETE FROM team_memberships WHERE team_id = '${team(2)}'`);
  }
  await client.exec(membership(3, 'substitute'));
  await expect(
    client.exec(`UPDATE team_memberships SET season_name = 'S3'
    WHERE team_id = '${team(1)}'`)
  ).rejects.toMatchObject({ code: '23503' });
  await expect(
    client.exec(`UPDATE teams SET season_name = 'S3'
    WHERE id = '${team(1)}'`)
  ).rejects.toMatchObject({ code: '23503' });

  // A season move must enforce the same rule as a new membership.
  await expect(
    client.exec(`UPDATE teams SET season_division_id = '${team(2)}', season_name = 'S1', name = 'Moved'
    WHERE id = '${team(3)}'`)
  ).rejects.toMatchObject({ code: '23P01' });
  await client.exec(`DELETE FROM team_memberships WHERE team_id = '${team(1)}';
    UPDATE teams SET season_division_id = '${team(2)}', season_name = 'S1', name = 'Moved' WHERE id = '${team(3)}';`);
  expect((await client.query('SELECT season_name FROM team_memberships')).rows).toEqual([
    { season_name: 'S1' }
  ]);
  await client.exec(`UPDATE seasons_divisions SET season_name = 'S3' WHERE id = '${team(2)}'`);
  expect((await client.query('SELECT season_name FROM team_memberships')).rows).toEqual([
    { season_name: 'S3' }
  ]);

  const [inserted] = await db
    .insert(schema.teams)
    .values({
      seasonDivisionId: team(3),
      name: 'New team',
      seasonName: 'S2'
    })
    .returning();
  expect(inserted?.seasonName).toBe('S2');
});

test.each([false, true])(
  'upgrade preserves existing memberships (conflict: %s)',
  async (conflict) => {
    const client = new PGlite({ extensions: { btree_gist } });
    onTestFinished(() => client.close());
    const baseline = await readFile(`${migrationsFolder}/0000_initial_schema.sql`, 'utf8');
    const upgrade = await readFile(
      `${migrationsFolder}/0001_competitive_membership_per_season.sql`,
      'utf8'
    );
    await client.exec(baseline);
    await fixtures(client, true);
    await client.exec(membership(1, 'top', true));
    if (conflict) await client.exec(membership(2, 'mid', true));

    if (conflict) {
      await expect(client.exec(`BEGIN; ${upgrade} COMMIT;`)).rejects.toMatchObject({
        code: '23P01'
      });
      await client.exec('ROLLBACK');
      expect((await client.query('SELECT count(*)::int AS n FROM team_memberships')).rows).toEqual([
        { n: 2 }
      ]);
      expect(
        (
          await client.query(`SELECT column_name FROM information_schema.columns
      WHERE table_name = 'teams' AND column_name = 'season_name'`)
        ).rows
      ).toEqual([]);
    } else {
      await client.exec(`BEGIN; ${upgrade} COMMIT;`);
      expect(
        (await client.query('SELECT season_name, discord_user_id FROM team_memberships')).rows
      ).toEqual([{ season_name: 'S1', discord_user_id: 'player' }]);
    }
  }
);
