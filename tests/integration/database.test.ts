import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { Table, is, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../packages/database/src/schema.js';

const migrationsFolder = fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url));
const seed = await readFile(
  new URL('../../packages/database/seed/demo.sql', import.meta.url),
  'utf8'
);
const teamId = '30000000-0000-4000-8000-000000000001';
const infoId = 'a0000000-0000-4000-8000-000000000001';

test('PostgreSQL migrations, fixtures and relational constraints', async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });

  await t.test('migrate twice and retain exactly one journal entry', async () => {
    await migrate(db, { migrationsFolder });
    const result = await client.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM drizzle.__drizzle_migrations'
    );
    assert.equal(result.rows[0]?.total, 1);
  });
  await t.test('seed twice in transactions without duplicate data', async () => {
    for (let i = 0; i < 2; i++) await client.transaction((tx) => tx.exec(seed));
    assert.equal((await db.select().from(schema.players)).length, 20);
    assert.equal((await db.select().from(schema.teams)).length, 4);
    assert.equal((await db.select().from(schema.playerGameInfo)).length, 10);
    assert.equal((await db.select().from(schema.seasons))[0]?.isActive, false);
  });
  await t.test('all 16 ORM tables map to executable SQL', async () => {
    const tables = Object.values(schema).filter((value) => is(value, Table));
    assert.equal(tables.length, 16);
    for (const table of tables) await db.select().from(table).limit(1);
  });
  await t.test('SQL columns, foreign keys, checks and indexes match Drizzle metadata', async () => {
    for (const table of Object.values(schema).filter((value) => is(value, Table))) {
      const config = getTableConfig(table);
      const columns = await client.query<{ name: string; not_null: boolean }>(
        `
        SELECT attname AS name, attnotnull AS not_null FROM pg_attribute
        WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attname`,
        [config.name]
      );
      assert.deepEqual(
        columns.rows,
        config.columns
          .map((column) => ({
            name: column.name,
            not_null: column.notNull
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'en')),
        `${config.name} columns`
      );
      const keys = await client.query<{ name: string }>(
        `
        SELECT conname AS name FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f' ORDER BY conname`,
        [config.name]
      );
      assert.deepEqual(
        keys.rows.map((row) => row.name).sort(),
        config.foreignKeys.map((key) => key.getName()).sort(),
        `${config.name} foreign keys`
      );
      const checks = await client.query<{ name: string }>(
        `
        SELECT conname AS name FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c'`,
        [config.name]
      );
      assert.deepEqual(
        checks.rows.map((row) => row.name).sort(),
        config.checks.map((check) => check.name).sort(),
        `${config.name} checks`
      );
      const indexes = await client.query<{ name: string }>(
        `
        SELECT indexname AS name FROM pg_indexes i WHERE schemaname='public' AND tablename=$1
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=('public.' || i.indexname)::regclass
          AND c.contype IN ('p','u'))`,
        [config.name]
      );
      assert.deepEqual(
        indexes.rows.map((row) => row.name).sort(),
        config.indexes.map((index) => index.config.name).sort(),
        `${config.name} indexes`
      );
    }
  });
  await t.test('stats, runes and build share their parent identity', async () => {
    const result = await client.query<{ total: number }>(`
      SELECT count(*)::int AS total FROM player_game_info i
      JOIN player_game_stats s ON s.id=i.id JOIN player_game_build b ON b.id=i.id
      JOIN player_game_runes r ON r.id=i.id`);
    assert.equal(result.rows[0]?.total, 10);
  });
  await t.test('Discord identities own rosters and may have multiple game accounts', async () => {
    const joined = await client.query<{ total: number }>(`
      SELECT count(*)::int AS total FROM team_memberships tm
      JOIN discord_users d ON d.discord_id=tm.discord_user_id
      JOIN players p ON p.discord_user_id=d.discord_id WHERE p.is_main`);
    assert.equal(joined.rows[0]?.total, 20);
    const accounts = await client.query<{ id: string }>(`
      INSERT INTO players (discord_user_id, game_name, riot_tag, puuid)
      VALUES ('900000000000000001', 'Alt DEMO', 'ONE', 'same-replay-puuid'),
             ('900000000000000001', 'Alt DEMO', 'TWO', 'same-replay-puuid') RETURNING id`);
    assert.equal(accounts.rows.length, 2);
    await client.query('DELETE FROM players WHERE id=ANY($1::uuid[])', [
      accounts.rows.map((row) => row.id)
    ]);
  });
  await t.test('captain and composite roster keys are enforced', async () => {
    await assert.rejects(
      client.exec(`UPDATE team_memberships SET is_captain=true
      WHERE team_id='30000000-0000-4000-8000-000000000001' AND discord_user_id='900000000000000002'`)
    );
    await assert.rejects(
      client.exec(`UPDATE team_memberships SET role='coach'
      WHERE team_id='30000000-0000-4000-8000-000000000001' AND is_captain`)
    );
    await assert.rejects(
      client.exec(`INSERT INTO team_memberships (team_id, discord_user_id, role)
      SELECT team_id, discord_user_id, role FROM team_memberships LIMIT 1`)
    );
  });
  await t.test(
    'round numbers are scoped to season/division and predictions use Discord IDs',
    async () => {
      const result = await client.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM rounds WHERE id=1'
      );
      assert.equal(result.rows[0]?.total, 2);
      const predictions = await db.select().from(schema.predictions);
      assert.equal(predictions[0]?.discordUserId, '900000000000000099');
      await assert.rejects(client.exec(`UPDATE rounds SET stage='invalid'`));
      await assert.rejects(client.exec('UPDATE matches SET id_round=99'));
    }
  );
  await t.test('negative stats and vision are rejected', async () => {
    await assert.rejects(
      client.query('UPDATE player_game_stats SET kills=-1 WHERE id=$1', [infoId])
    );
    await assert.rejects(
      client.query('UPDATE player_game_stats SET vision_score=-1 WHERE id=$1', [infoId])
    );
    assert.equal((await db.select().from(schema.playerGameStats)).length, 10);
  });
  await t.test('invalid winner and duplicate participant are rejected', async () => {
    await assert.rejects(
      client.exec(`UPDATE matches SET winner_team_id='30000000-0000-4000-8000-000000000003'
      WHERE id='70000000-0000-4000-8000-000000000001'`)
    );
    await assert.rejects(
      client.exec(`INSERT INTO player_game_info (match_game_id, player_id, team_id, side, champion)
      SELECT match_game_id, player_id, team_id, side, champion FROM player_game_info LIMIT 1`)
    );
  });
  await t.test('a parent missing children fails at commit and is rolled back', async () => {
    const before = (await db.select().from(schema.playerGameInfo)).length;
    await assert.rejects(
      client.transaction(async (tx) => {
        await tx.exec(`INSERT INTO player_game_info (match_game_id, player_id, team_id, side, champion)
        VALUES ('80000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000011',
        '30000000-0000-4000-8000-000000000001','blue','Ahri')`);
      })
    );
    assert.equal((await db.select().from(schema.playerGameInfo)).length, before);
  });
  await t.test('deleting only a required child is rejected', async () => {
    await assert.rejects(client.query('DELETE FROM player_game_build WHERE id=$1', [infoId]));
    assert.equal((await db.select().from(schema.playerGameBuild)).length, 10);
  });
  await t.test('single active season is enforced by a unique index', async () => {
    await client.exec("INSERT INTO seasons (name, is_active) VALUES ('Active test', true)");
    await assert.rejects(
      client.exec("INSERT INTO seasons (name, is_active) VALUES ('Another active', true)")
    );
    await client.exec("DELETE FROM seasons WHERE name='Active test'");
  });
  await t.test('updated_at changes without application intervention', async () => {
    await client.query("UPDATE teams SET updated_at='2000-01-01' WHERE id=$1", [teamId]);
    const result = await client.query<{ recent: boolean }>(
      "SELECT updated_at > '2020-01-01'::timestamptz AS recent FROM teams WHERE id=$1",
      [teamId]
    );
    assert.equal(result.rows[0]?.recent, true);
  });
  await t.test('deleting the parent cascades all three children', async () => {
    await client.query('DELETE FROM player_game_info WHERE id=$1', [infoId]);
    for (const table of [schema.playerGameStats, schema.playerGameRunes, schema.playerGameBuild]) {
      assert.equal((await db.select().from(table).where(sql`${table.id} = ${infoId}`)).length, 0);
    }
  });
});
