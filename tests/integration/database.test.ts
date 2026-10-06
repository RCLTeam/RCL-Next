import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { Table, is, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { assert, expect, test } from 'vitest';
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
  t.onTestFinished(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });

  // migrate twice and retain the single consolidated journal entry
  {
    await migrate(db, { migrationsFolder });
    const result = await client.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM drizzle.__drizzle_migrations'
    );
    expect(result.rows[0]?.total).toBe(1);
  }
  // matches schema defines stream_url_live column
  expect(schema.matches.streamUrlLive).toBeTruthy();
  expect(schema.matches.streamUrlLive.name).toBe('stream_url_live');
  // teams schema defines discord_role_id column
  expect(schema.teams.discordRoleId).toBeTruthy();
  expect(schema.teams.discordRoleId.name).toBe('discord_role_id');
  expect(schema.teams.discordRoleId.dataType).toBe('bigint');
  expect(schema.teams.discordRoleId.isUnique).toBe(true);
  // matches schema defines discord_channel_id and jornada columns
  expect(schema.matches.discordChannelId).toBeTruthy();
  expect(schema.matches.discordChannelId.name).toBe('discord_channel_id');
  expect(schema.matches.discordChannelId.dataType).toBe('bigint');
  expect(schema.matches.discordChannelId.isUnique).toBe(true);
  expect(schema.matches.jornada).toBeTruthy();
  expect(schema.matches.jornada.name).toBe('jornada');
  expect(schema.matches.jornada.dataType).toBe('number');
  // seed twice in transactions without duplicate data
  for (let i = 0; i < 2; i++) await client.transaction((tx) => tx.exec(seed));
  expect((await db.select().from(schema.players)).length).toBe(20);
  expect((await db.select().from(schema.teams)).length).toBe(4);
  expect((await db.select().from(schema.playerGameInfo)).length).toBe(10);
  expect('isActive' in ((await db.select().from(schema.seasons))[0] ?? {})).toBe(false);
  // all 21 ORM tables map to executable SQL
  {
    const tables = Object.values(schema).filter((value) => is(value, Table));
    expect(tables.length).toBe(21);
    for (const table of tables) await db.select().from(table).limit(1);
  }
  // SQL columns, foreign keys, checks and indexes match Drizzle metadata
  for (const table of Object.values(schema).filter((value) => is(value, Table))) {
    const config = getTableConfig(table);
    const columns = await client.query<{ name: string; not_null: boolean }>(
      `
        SELECT attname AS name, attnotnull AS not_null FROM pg_attribute
        WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attname`,
      [config.name]
    );
    expect(columns.rows, `${config.name} columns`).toStrictEqual(
      config.columns
        .map((column) => ({
          name: column.name,
          not_null: column.notNull
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    );
    const keys = await client.query<{ name: string }>(
      `
        SELECT conname AS name FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f' ORDER BY conname`,
      [config.name]
    );
    expect(keys.rows.map((row) => row.name).sort(), `${config.name} foreign keys`).toStrictEqual(
      config.foreignKeys.map((key) => key.getName()).sort()
    );
    const checks = await client.query<{ name: string }>(
      `
        SELECT conname AS name FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c'`,
      [config.name]
    );
    expect(checks.rows.map((row) => row.name).sort(), `${config.name} checks`).toStrictEqual(
      config.checks.map((check) => check.name).sort()
    );
    const indexes = await client.query<{ name: string }>(
      `
        SELECT indexname AS name FROM pg_indexes i WHERE schemaname='public' AND tablename=$1
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=('public.' || i.indexname)::regclass
          AND c.contype IN ('p','u'))`,
      [config.name]
    );
    expect(indexes.rows.map((row) => row.name).sort(), `${config.name} indexes`).toStrictEqual(
      config.indexes.map((index) => index.config.name).sort()
    );
  }
  // stats, runes and build share their parent identity
  {
    const result = await client.query<{ total: number }>(`
      SELECT count(*)::int AS total FROM player_game_info i
      JOIN player_game_stats s ON s.id=i.id JOIN player_game_build b ON b.id=i.id
      JOIN player_game_runes r ON r.id=i.id`);
    expect(result.rows[0]?.total).toBe(10);
  }
  // Discord identities own rosters and may have multiple game accounts
  {
    const joined = await client.query<{ total: number }>(`
      SELECT count(*)::int AS total FROM team_memberships tm
      JOIN discord_users d ON d.discord_id=tm.discord_user_id
      JOIN players p ON p.discord_user_id=d.discord_id WHERE p.is_main`);
    expect(joined.rows[0]?.total).toBe(20);
    const accounts = await client.query<{ id: string }>(`
      INSERT INTO players (discord_user_id, game_name, riot_tag, puuid)
      VALUES ('900000000000000001', 'Alt DEMO', 'ONE', 'same-replay-puuid'),
             ('900000000000000001', 'Alt DEMO', 'TWO', 'same-replay-puuid') RETURNING id`);
    expect(accounts.rows.length).toBe(2);
    await client.query('DELETE FROM players WHERE id=ANY($1::uuid[])', [
      accounts.rows.map((row) => row.id)
    ]);
  }
  // captain and composite roster keys are enforced
  await expect(
    client.exec(`UPDATE team_memberships SET is_captain=true
      WHERE team_id='30000000-0000-4000-8000-000000000001' AND discord_user_id='900000000000000002'`)
  ).rejects.toThrow();
  await expect(
    client.exec(`UPDATE team_memberships SET role='coach'
      WHERE team_id='30000000-0000-4000-8000-000000000001' AND is_captain`)
  ).rejects.toThrow();
  await expect(
    client.exec(`INSERT INTO team_memberships (team_id, discord_user_id, role)
      SELECT team_id, discord_user_id, role FROM team_memberships LIMIT 1`)
  ).rejects.toThrow();
  // round numbers are scoped to season/division and predictions use Discord IDs
  {
    const result = await client.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM rounds WHERE id=1'
    );
    expect(result.rows[0]?.total).toBe(2);
    const predictions = await db.select().from(schema.predictions);
    expect(predictions[0]?.discordUserId).toBe('900000000000000099');
    await expect(client.exec(`UPDATE rounds SET stage='invalid'`)).rejects.toThrow();
    await expect(client.exec('UPDATE matches SET id_round=99')).rejects.toThrow();
  }
  // negative stats and vision are rejected
  await expect(
    client.query('UPDATE player_game_stats SET kills=-1 WHERE id=$1', [infoId])
  ).rejects.toThrow();
  await expect(
    client.query('UPDATE player_game_stats SET vision_score=-1 WHERE id=$1', [infoId])
  ).rejects.toThrow();
  expect((await db.select().from(schema.playerGameStats)).length).toBe(10);
  // invalid winner and duplicate participant are rejected
  await expect(
    client.exec(`UPDATE matches SET winner_team_id='30000000-0000-4000-8000-000000000003'
      WHERE id='70000000-0000-4000-8000-000000000001'`)
  ).rejects.toThrow();
  await expect(
    client.exec(`INSERT INTO player_game_info (match_game_id, player_id, team_id, side, champion)
      SELECT match_game_id, player_id, team_id, side, champion FROM player_game_info LIMIT 1`)
  ).rejects.toThrow();
  // a parent missing children fails at commit and is rolled back
  {
    const before = (await db.select().from(schema.playerGameInfo)).length;
    await expect(
      client.transaction(async (tx) => {
        await tx.exec(`INSERT INTO player_game_info (match_game_id, player_id, team_id, side, champion)
        VALUES ('80000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000011',
        '30000000-0000-4000-8000-000000000001','blue','Ahri')`);
      })
    ).rejects.toThrow();
    expect((await db.select().from(schema.playerGameInfo)).length).toBe(before);
  }
  // deleting only a required child is rejected
  await expect(
    client.query('DELETE FROM player_game_build WHERE id=$1', [infoId])
  ).rejects.toThrow();
  expect((await db.select().from(schema.playerGameBuild)).length).toBe(10);
  // seasons have no active flag or unique active index while teams retain their flag
  {
    const column = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='seasons' AND column_name='is_active'"
    );
    const index = await client.query(
      "SELECT indexname FROM pg_indexes WHERE tablename='seasons' AND indexname='seasons_one_active_key'"
    );
    expect(column.rows.length).toBe(0);
    expect(index.rows.length).toBe(0);
    expect((await db.select().from(schema.teams))[0]?.isActive).toBe(true);
  }
  // updated_at changes without application intervention
  {
    await client.query("UPDATE teams SET updated_at='2000-01-01' WHERE id=$1", [teamId]);
    const result = await client.query<{ recent: boolean }>(
      "SELECT updated_at > '2020-01-01'::timestamptz AS recent FROM teams WHERE id=$1",
      [teamId]
    );
    expect(result.rows[0]?.recent).toBe(true);
  }
  // deleting the parent cascades all three children
  await client.query('DELETE FROM player_game_info WHERE id=$1', [infoId]);
  for (const table of [schema.playerGameStats, schema.playerGameRunes, schema.playerGameBuild]) {
    expect((await db.select().from(table).where(sql`${table.id} = ${infoId}`)).length).toBe(0);
  }
  // roster_movements inserts all 5 valid actions and rejects invalid enum
  {
    const actions = [
      'joined',
      'left',
      'promoted_to_captain',
      'demoted_from_captain',
      'role_changed'
    ] as const;

    for (const action of actions) {
      const [inserted] = await db
        .insert(schema.rosterMovements)
        .values({
          teamId,
          discordUserId: '900000000000000001',
          action,
          role: 'top',
          actorId: '900000000000000002'
        })
        .returning();
      assert.ok(inserted);
      expect(inserted.action).toBe(action);
      expect(inserted.role).toBe('top');
    }

    await expect(
      client.query(
        "INSERT INTO roster_movements (team_id, discord_user_id, action) VALUES ($1, $2, 'invalid_action')",
        [teamId, '900000000000000001']
      )
    ).rejects.toThrow();
  }
  // roster_movements cascades on team and subject user deletion, and sets null on actor deletion
  {
    // 1. Team cascade
    const tempSeasonDivId = '20000000-0000-4000-8000-000000000001';
    const tempTeamId = '30000000-0000-4000-8000-000000000099';
    await client.query(
      "INSERT INTO teams (id, season_division_id, name, short_name) VALUES ($1, $2, 'Ephemeral Team', 'EPHT')",
      [tempTeamId, tempSeasonDivId]
    );
    const [teamMov] = await db
      .insert(schema.rosterMovements)
      .values({
        teamId: tempTeamId,
        discordUserId: '900000000000000001',
        action: 'joined'
      })
      .returning();
    assert.ok(teamMov);

    await client.query('DELETE FROM teams WHERE id = $1', [tempTeamId]);
    const afterTeamDelete = await db
      .select()
      .from(schema.rosterMovements)
      .where(sql`${schema.rosterMovements.id} = ${teamMov.id}`);
    expect(afterTeamDelete.length).toBe(0);

    // 2. Subject user cascade
    const tempSubjectId = '900000000000000088';
    await client.query(
      "INSERT INTO discord_users (discord_id, username) VALUES ($1, 'Ephemeral Subject')",
      [tempSubjectId]
    );
    const [userMov] = await db
      .insert(schema.rosterMovements)
      .values({
        teamId,
        discordUserId: tempSubjectId,
        action: 'joined'
      })
      .returning();
    assert.ok(userMov);

    await client.query('DELETE FROM discord_users WHERE discord_id = $1', [tempSubjectId]);
    const afterUserDelete = await db
      .select()
      .from(schema.rosterMovements)
      .where(sql`${schema.rosterMovements.id} = ${userMov.id}`);
    expect(afterUserDelete.length).toBe(0);

    // 3. Actor user SET NULL
    const tempActorId = '900000000000000089';
    await client.query(
      "INSERT INTO discord_users (discord_id, username) VALUES ($1, 'Ephemeral Actor')",
      [tempActorId]
    );
    const [actorMov] = await db
      .insert(schema.rosterMovements)
      .values({
        teamId,
        discordUserId: '900000000000000001',
        action: 'promoted_to_captain',
        actorId: tempActorId
      })
      .returning();
    assert.ok(actorMov);
    expect(actorMov.actorId).toBe(tempActorId);

    await client.query('DELETE FROM discord_users WHERE discord_id = $1', [tempActorId]);
    const [afterActorDelete] = await db
      .select()
      .from(schema.rosterMovements)
      .where(sql`${schema.rosterMovements.id} = ${actorMov.id}`);
    assert.ok(afterActorDelete);
    expect(afterActorDelete.actorId).toBe(null);
  }
  // roster_movements updated_at changes via set_updated_at trigger
  {
    const [mov] = await db
      .insert(schema.rosterMovements)
      .values({
        teamId,
        discordUserId: '900000000000000001',
        action: 'role_changed',
        role: 'substitute'
      })
      .returning();
    assert.ok(mov);

    await client.query("UPDATE roster_movements SET updated_at = '2000-01-01' WHERE id = $1", [
      mov.id
    ]);
    const result = await client.query<{ recent: boolean }>(
      "SELECT updated_at > '2020-01-01'::timestamptz AS recent FROM roster_movements WHERE id = $1",
      [mov.id]
    );
    expect(result.rows[0]?.recent).toBe(true);
  }
});
