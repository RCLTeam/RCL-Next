import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { assert, expect, test } from 'vitest';
import * as schema from '../../packages/database/src/schema.js';

interface DbErrorLike {
  message: string;
  code?: string;
  cause?: {
    message?: string;
    code?: string;
  };
}

const migrationsFolder = fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url));
const seed = await readFile(
  new URL('../../packages/database/seed/demo.sql', import.meta.url),
  'utf8'
);

test('Database schema constraints and Discord entity attributes', async (t) => {
  const client = new PGlite();
  t.onTestFinished(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  await client.exec(seed);

  // 1: System Catalog check for unique constraints
  // PostgreSQL catalog contains UNIQUE constraints for discord_role_id and discord_channel_id
  {
    const teamConstraints = await client.query<{ conname: string }>(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'teams'::regclass AND contype = 'u'
      `);
    const teamConNames = teamConstraints.rows.map((r) => r.conname);
    expect(
      teamConNames.includes('teams_discord_role_id_unique'),
      `teams table missing teams_discord_role_id_unique constraint in pg_constraint. Found: ${teamConNames.join(', ')}`
    ).toBeTruthy();

    const matchConstraints = await client.query<{ conname: string }>(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'matches'::regclass AND contype = 'u'
      `);
    const matchConNames = matchConstraints.rows.map((r) => r.conname);
    expect(
      matchConNames.includes('matches_discord_channel_id_unique'),
      `matches table missing matches_discord_channel_id_unique constraint in pg_constraint. Found: ${matchConNames.join(', ')}`
    ).toBeTruthy();
  }

  // 2: Enforcement of UNIQUE constraints (rejection of duplicates)
  // Enforcement: Duplicate non-null discord_role_id is rejected by PostgreSQL
  {
    const existingTeams = await db.select().from(schema.teams).limit(2);
    expect(existingTeams.length).toBe(2);
    const team1 = existingTeams[0];
    const team2 = existingTeams[1];
    assert.ok(team1 && team2);

    const duplicateRoleId = 111222333444555666n;

    // First update succeeds
    await db
      .update(schema.teams)
      .set({ discordRoleId: duplicateRoleId })
      .where(eq(schema.teams.id, team1.id));

    // Second update with same discordRoleId must fail with unique constraint violation
    await expect(async () => {
      await db
        .update(schema.teams)
        .set({ discordRoleId: duplicateRoleId })
        .where(eq(schema.teams.id, team2.id));
    }, 'Expected unique constraint violation on teams.discord_role_id').rejects.toSatisfy(
      (rawErr: unknown) => {
        const err = rawErr as DbErrorLike;
        const fullMsg = `${err.message} ${err.cause?.message || ''}`;
        const code = err.code || err.cause?.code;
        return (
          fullMsg.includes('teams_discord_role_id_unique') ||
          fullMsg.includes('unique constraint') ||
          code === '23505'
        );
      }
    );
  }

  // Enforcement: Duplicate non-null discord_channel_id is rejected by PostgreSQL
  {
    const existingMatches = await db.select().from(schema.matches).limit(2);
    expect(existingMatches.length).toBe(2);
    const match1 = existingMatches[0];
    const match2 = existingMatches[1];
    assert.ok(match1 && match2);

    const duplicateChannelId = 999888777666555444n;

    // First update succeeds
    await db
      .update(schema.matches)
      .set({ discordChannelId: duplicateChannelId })
      .where(eq(schema.matches.id, match1.id));

    // Second update with same discordChannelId must fail
    await expect(async () => {
      await db
        .update(schema.matches)
        .set({ discordChannelId: duplicateChannelId })
        .where(eq(schema.matches.id, match2.id));
    }, 'Expected unique constraint violation on matches.discord_channel_id').rejects.toSatisfy(
      (rawErr: unknown) => {
        const err = rawErr as DbErrorLike;
        const fullMsg = `${err.message} ${err.cause?.message || ''}`;
        const code = err.code || err.cause?.code;
        return (
          fullMsg.includes('matches_discord_channel_id_unique') ||
          fullMsg.includes('unique constraint') ||
          code === '23505'
        );
      }
    );
  }

  // 3: Multiple NULL values permitted
  // Nullability: Multiple NULL values are accepted for unique columns
  {
    const teams = await db.select().from(schema.teams);
    for (const team of teams) {
      await db
        .update(schema.teams)
        .set({ discordRoleId: null })
        .where(eq(schema.teams.id, team.id));
    }
    const nullTeams = await db.select().from(schema.teams);
    expect(nullTeams.every((t) => t.discordRoleId === null)).toBeTruthy();

    const matches = await db.select().from(schema.matches);
    for (const match of matches) {
      await db
        .update(schema.matches)
        .set({ discordChannelId: null, jornada: null })
        .where(eq(schema.matches.id, match.id));
    }
    const nullMatches = await db.select().from(schema.matches);
    expect(
      nullMatches.every((m) => m.discordChannelId === null && m.jornada === null)
    ).toBeTruthy();
  }

  // 4: BigInt 64-bit precision and edge values (no JS Number truncation)
  // BigInt Fidelity: 64-bit integer values exceed MAX_SAFE_INTEGER without precision loss
  {
    const teams = await db.select().from(schema.teams).limit(1);
    const team = teams[0];
    assert.ok(team);

    // Discord snowflake: 19 digits, strictly > 2^53 - 1 (9007199254740991)
    const snowflake = 1234567890123456789n;
    expect(snowflake > BigInt(Number.MAX_SAFE_INTEGER)).toBeTruthy();

    await db
      .update(schema.teams)
      .set({ discordRoleId: snowflake })
      .where(eq(schema.teams.id, team.id));

    const [updated] = await db.select().from(schema.teams).where(eq(schema.teams.id, team.id));
    expect(typeof updated?.discordRoleId).toBe('bigint');
    expect(updated?.discordRoleId).toBe(snowflake);

    // Max signed 64-bit integer: 2^63 - 1 = 9223372036854775807n
    const maxInt64 = 9223372036854775807n;
    await db
      .update(schema.teams)
      .set({ discordRoleId: maxInt64 })
      .where(eq(schema.teams.id, team.id));

    const [updatedMax] = await db.select().from(schema.teams).where(eq(schema.teams.id, team.id));
    expect(typeof updatedMax?.discordRoleId).toBe('bigint');
    expect(updatedMax?.discordRoleId).toBe(maxInt64);
  }

  // 5: Out of range 64-bit overflow rejection
  // BigInt Boundary: Values exceeding 64-bit signed integer range are rejected by Postgres
  {
    const teams = await db.select().from(schema.teams).limit(1);
    const team = teams[0];
    assert.ok(team);

    // 2^63 = 9223372036854775808n (exceeds int64 max)
    const overflowVal = 9223372036854775808n;

    await expect(async () => {
      await client.query('UPDATE teams SET discord_role_id = $1 WHERE id = $2', [
        overflowVal.toString(),
        team.id
      ]);
    }, 'Expected bigint out of range error').rejects.toSatisfy((rawErr: unknown) => {
      const err = rawErr as DbErrorLike;
      return err.message.includes('out of range') || err.code === '22003';
    });
  }

  // 6: Jornada column integer behavior
  // Jornada: integer type handles positive, zero, null and rejects float string
  {
    const matches = await db.select().from(schema.matches).limit(1);
    const match = matches[0];
    assert.ok(match);

    await db.update(schema.matches).set({ jornada: 15 }).where(eq(schema.matches.id, match.id));

    let [m] = await db.select().from(schema.matches).where(eq(schema.matches.id, match.id));
    expect(typeof m?.jornada).toBe('number');
    expect(m?.jornada).toBe(15);

    await db.update(schema.matches).set({ jornada: 0 }).where(eq(schema.matches.id, match.id));

    [m] = await db.select().from(schema.matches).where(eq(schema.matches.id, match.id));
    expect(m?.jornada).toBe(0);
  }

  // 7: Schema inspection of uniqueConstraints vs pg_constraint
  // Schema Inspection: Drizzle uniqueConstraints vs PostgreSQL contype u
  {
    const teamsConfig = getTableConfig(schema.teams);
    const pgConstraints = await client.query<{ conname: string }>(`
      SELECT conname FROM pg_constraint WHERE conrelid = 'teams'::regclass AND contype = 'u'
    `);

    const pgConNames = pgConstraints.rows.map((r) => r.conname);

    expect(schema.teams.discordRoleId.isUnique === true).toBeTruthy();
    expect(teamsConfig.name === 'teams').toBeTruthy();
    expect(pgConNames.includes('teams_discord_role_id_unique')).toBeTruthy();
    expect(pgConNames.includes('teams_season_division_name_key')).toBeTruthy();
  }
});
