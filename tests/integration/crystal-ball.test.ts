import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import type { CrystalAnswers } from '@rcl/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expect, test, vi } from 'vitest';
import { CrystalBallRepository } from '../../apps/api/src/modules/crystal-ball/persistence/crystal-ball.repository.js';
import * as schema from '../../packages/database/src/schema.js';

test('crystal ballots persist, close exactly on time, score corrections idempotently and isolate seasons', async (t) => {
  const client = new PGlite({ extensions: { btree_gist } });
  t.onTestFinished(async () => {
    vi.useRealTimers();
    await client.close();
  });
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
  });
  await client.exec(
    await readFile(new URL('../../packages/database/seed/demo.sql', import.meta.url), 'utf8')
  );
  const season = 'Temporada DEMO — datos ficticios';
  const userId = '900000000000000001';
  const divisions = await db.select().from(schema.seasonsDivisions);
  const [match] = await db.select().from(schema.matches);
  if (!match) throw new Error('Missing match fixture');
  const divisionId = match.idSeasonDivision;
  const otherId = divisions.find((d) => d.id !== divisionId)?.id;
  if (!otherId) throw new Error('Missing second league fixture');
  const repo = new CrystalBallRepository(db, divisionId);
  const other = new CrystalBallRepository(db, otherId);
  let role = 100;
  for (const division of divisions)
    for (let i = 0; i < 4; i++)
      await db.insert(schema.teams).values({
        name: `Extra ${i}`,
        seasonName: season,
        seasonDivisionId: division.id,
        discordRoleId: BigInt(role++)
      });
  await client.exec("UPDATE rounds SET stage = 'regular';");
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2050-01-01T00:00:00Z'));
  expect((await repo.overview(season)).status).toBe('unconfigured');
  await repo.configure(season, new Date('2050-01-02T00:00:00Z'), new Date('2050-01-03T00:00:00Z'));
  expect((await repo.overview(season)).status).toBe('upcoming');
  await expect(repo.save(season, userId, {})).rejects.toMatchObject({ code: 'CRYSTAL_CLOSED' });
  vi.setSystemTime(new Date('2050-01-02T00:00:00Z'));
  const data = await repo.overview(season);
  expect(data.status).toBe('open');
  const playerOption = data.questions.find((q) => q.kind === 'player')?.options[0];
  if (!playerOption?.discordId) throw new Error('Missing player Discord fixture');
  await db
    .update(schema.discordUsers)
    .set({ avatarHash: 'abcdef1234567890abcdef1234567890' })
    .where(eq(schema.discordUsers.discordId, playerOption.discordId));
  const duplicateId = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
  await db.insert(schema.players).values({
    id: duplicateId,
    discordUserId: playerOption.discordId,
    gameName: 'Duplicate main',
    isMain: true
  });
  const refreshed = await repo.overview(season);
  expect(
    refreshed.questions
      .find((q) => q.kind === 'player')
      ?.options.find((o) => o.id === playerOption.id)
  ).toMatchObject({
    discordId: playerOption.discordId,
    avatarHash: 'abcdef1234567890abcdef1234567890'
  });

  expect(
    refreshed.questions
      .find((q) => q.kind === 'player')
      ?.options.filter((o) => o.discordId === playerOption.discordId)
  ).toHaveLength(1);
  await db.delete(schema.players).where(eq(schema.players.id, duplicateId));
  const playerIds = async () =>
    (await repo.overview(season)).questions
      .find((q) => q.kind === 'player')
      ?.options.map((o) => o.id);
  await db
    .update(schema.players)
    .set({ isMain: false })
    .where(eq(schema.players.id, playerOption.id));
  expect(await playerIds()).not.toContain(playerOption.id);
  await db
    .update(schema.players)
    .set({ isMain: true })
    .where(eq(schema.players.id, playerOption.id));
  const memberships = await db
    .select()
    .from(schema.teamMemberships)
    .where(eq(schema.teamMemberships.discordUserId, playerOption.discordId));
  await db
    .update(schema.teamMemberships)
    .set({ role: 'coach', isCaptain: false })
    .where(eq(schema.teamMemberships.discordUserId, playerOption.discordId));
  expect(await playerIds()).not.toContain(playerOption.id);
  await db
    .update(schema.teamMemberships)
    .set({ role: 'substitute' })
    .where(eq(schema.teamMemberships.discordUserId, playerOption.discordId));
  expect(await playerIds()).toContain(playerOption.id);
  for (const membership of memberships)
    await db
      .update(schema.teamMemberships)
      .set({ role: membership.role, isCaptain: membership.isCaptain })
      .where(eq(schema.teamMemberships.discordUserId, playerOption.discordId));

  const answers: CrystalAnswers = Object.fromEntries(
    data.questions.map((q) => [
      q.id,
      q.kind === 'integer'
        ? ['0']
        : q.kind === 'champion'
          ? ['Ahri']
          : q.options
              .slice(q.id.startsWith('loser:') ? 4 : 0, q.id.startsWith('loser:') ? 6 : q.count)
              .map((o) => o.id)
    ])
  );
  await expect(repo.save(season, userId, {})).rejects.toMatchObject({ code: 'INCOMPLETE_BALLOT' });
  await repo.save(season, userId, answers);
  await repo.save(season, userId, answers);
  expect((await repo.mine(season, userId))['champion-picks']).toEqual(['ahri']);
  // Imported/demo results must close voting even with future dates and no playoff matches.
  const originalBallot = await repo.mine(season, userId);
  for (const published of [
    { results: { pentakills: ['0'] } },
    { automaticResults: { pentakills: ['0'] } },
    { calculatedAt: new Date() },
    { resolvedBy: userId }
  ]) {
    await db
      .update(schema.crystalBallLeagueCampaigns)
      .set(published)
      .where(eq(schema.crystalBallLeagueCampaigns.divisionId, divisionId));
    expect((await repo.overview(season)).status).toBe('closed');
    await expect(
      repo.save(season, userId, { ...answers, pentakills: ['1'] })
    ).rejects.toMatchObject({ code: 'CRYSTAL_CLOSED' });
    await expect(repo.save(season, '900000000000000002', answers)).rejects.toMatchObject({
      code: 'CRYSTAL_CLOSED'
    });
    await expect(
      repo.configure(season, new Date('2050-01-01'), new Date('2050-02-01'))
    ).rejects.toMatchObject({ code: 'CRYSTAL_CLOSED' });
    expect(await repo.mine(season, userId)).toEqual(originalBallot);
    // Restore only this fixture between independent legacy-state cases.
    await db
      .update(schema.crystalBallLeagueCampaigns)
      .set({ results: {}, automaticResults: {}, calculatedAt: null, resolvedBy: null })
      .where(eq(schema.crystalBallLeagueCampaigns.divisionId, divisionId));
  }
  await expect(repo.mine('Other season', userId)).rejects.toMatchObject({ status: 404 });
  expect(await other.mine(season, userId)).toEqual({});
  expect((await other.overview(season)).status).toBe('unconfigured');
  await other.configure(season, new Date('2050-01-01T00:00:00Z'), new Date('2050-02-01T00:00:00Z'));
  const otherData = await other.overview(season);
  const otherAnswers: CrystalAnswers = Object.fromEntries(
    otherData.questions.map((q) => [
      q.id,
      q.kind === 'integer'
        ? ['1']
        : q.kind === 'champion'
          ? ['Lux']
          : q.options
              .slice(q.id.startsWith('loser:') ? 4 : 0, q.id.startsWith('loser:') ? 6 : q.count)
              .map((o) => o.id)
    ])
  );
  await other.save(season, userId, otherAnswers);
  expect((await other.mine(season, userId))['champion-picks']).toEqual(['lux']);
  expect((await repo.mine(season, userId))['champion-picks']).toEqual(['ahri']);
  await expect(other.save(season, userId, answers)).rejects.toMatchObject({
    code: 'INVALID_ANSWER'
  });
  expect(data.questions).toHaveLength(24);
  expect(data.questions.filter((q) => q.divisionId).every((q) => q.divisionId === divisionId)).toBe(
    true
  );
  expect(await db.select().from(schema.crystalBallLeagueEntries)).toHaveLength(2);
  await expect(repo.resolve(season, userId, {}, false)).rejects.toMatchObject({
    code: 'CRYSTAL_NOT_CLOSED'
  });
  vi.setSystemTime(new Date('2050-01-03T00:00:00Z'));
  expect((await other.overview(season)).status).toBe('open');
  await expect(repo.save(season, userId, answers)).rejects.toMatchObject({
    code: 'CRYSTAL_CLOSED'
  });
  await expect(
    repo.configure(season, new Date('2050-01-02T00:00:00Z'), new Date('2050-01-04T00:00:00Z'))
  ).rejects.toMatchObject({ code: 'CRYSTAL_CLOSED' });
  const manual = Object.fromEntries(
    data.questions.filter((q) => q.mode === 'manual').map((q) => [q.id, answers[q.id] ?? []])
  );
  await repo.resolve(season, userId, manual, false);
  const points = (await repo.overview(season)).ranking[0]?.points;
  expect(points).toBe(13);
  await repo.resolve(season, userId, manual, false);
  expect((await repo.overview(season)).ranking[0]?.points).toBe(points);
  await expect(repo.resolve(season, userId, {}, true)).rejects.toMatchObject({
    code: 'PLAYOFFS_UNFINISHED'
  });
  await repo.resolve(season, userId, {}, false);
  expect((await repo.overview(season)).ranking).toEqual([]);
  // A scheduled playoff round without matches still closes voting.
  await db.insert(schema.rounds).values({
    id: 30000,
    idSeasonDivision: otherId,
    stage: 'playoff',
    startsAt: new Date('2050-01-03T00:00:00Z')
  });
  expect((await other.overview(season)).status).toBe('closed');
  await expect(other.save(season, userId, otherAnswers)).rejects.toMatchObject({
    code: 'CRYSTAL_CLOSED'
  });
  // An unexpectedly early playoff also blocks a campaign whose configured deadline is later.
  await db
    .update(schema.crystalBallLeagueCampaigns)
    .set({ closesAt: new Date('2050-02-01T00:00:00Z') })
    .where(eq(schema.crystalBallLeagueCampaigns.divisionId, divisionId));
  await client.exec("UPDATE rounds SET stage = 'playoff', starts_at = '2050-01-02T00:00:00Z';");
  expect((await repo.overview(season)).status).toBe('closed');
  await expect(repo.save(season, userId, answers)).rejects.toMatchObject({
    code: 'CRYSTAL_CLOSED'
  });
  await client.exec("UPDATE matches SET status = 'cancelled';");
  const games = await db.select().from(schema.matchGames);
  const matchId = games[0]?.matchesId;
  if (!matchId) throw new Error('Missing demo map');
  const mapCount = games.filter((g) => g.matchesId === matchId).length;
  await db
    .update(schema.matches)
    .set({ status: 'completed', team1Score: mapCount, team2Score: 0 })
    .where(eq(schema.matches.id, matchId));
  // Production telemetry has no map MVP; both series MVP and secondary accounts resolve to the main account.
  const info = (
    await db
      .select()
      .from(schema.playerGameInfo)
      .where(
        eq(schema.playerGameInfo.matchGameId, games.find((g) => g.matchesId === matchId)?.id ?? '')
      )
  )[0];
  if (!info) throw new Error('Missing player map');
  const [mainAccount] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, info.playerId));
  if (!mainAccount?.discordUserId) throw new Error('Missing main account');
  const altId = 'ffffffff-ffff-4fff-8fff-fffffffffff2';
  await db.insert(schema.players).values({
    id: altId,
    discordUserId: mainAccount.discordUserId,
    gameName: 'Secondary account',
    isMain: false
  });
  await db
    .update(schema.playerGameInfo)
    .set({ playerId: altId })
    .where(eq(schema.playerGameInfo.id, info.id));
  await db.update(schema.playerGameStats).set({ isMvp: false });
  await db
    .update(schema.playerGameStats)
    .set({ kills: 100 })
    .where(eq(schema.playerGameStats.id, info.id));
  await db
    .update(schema.matches)
    .set({ mvpPlayerId: altId, mvpScore: '10.0' })
    .where(eq(schema.matches.id, matchId));
  await repo.resolve(season, userId, manual, false);
  await repo.resolve(season, userId, {}, true);
  const resolved = await repo.overview(season);
  expect(resolved.status).toBe('closed');
  expect(resolved.results['player-mvp']).toEqual([mainAccount.id]);
  expect(resolved.results['player-kills']).toEqual([mainAccount.id]);
  expect(resolved.results['surprise-team']).toEqual(manual['surprise-team']);
  expect(resolved.calculatedAt).not.toBeNull();
  expect(resolved.results['player-kills']?.length).toBeGreaterThan(0);
  await repo.resolve(season, userId, manual, true);
  expect((await repo.overview(season)).ranking).toEqual(resolved.ranking);
  const fallback = Object.fromEntries(
    data.questions
      .filter((q) => q.mode === 'manual' || !resolved.automaticResults?.[q.id])
      .map((q) => [q.id, answers[q.id] ?? []])
  );
  await repo.resolve(season, userId, fallback, false);
  expect((await repo.overview(season)).status).toBe('resolved');
  // Recalculation preserves fallback results; removing a fallback reopens resolution, never voting.
  await repo.resolve(season, userId, {}, true);
  expect((await repo.overview(season)).status).toBe('resolved');
  await repo.resolve(
    season,
    userId,
    Object.fromEntries(Object.entries(fallback).filter(([id]) => id !== 'champion-best-winrate')),
    false
  );
  expect((await repo.overview(season)).status).toBe('closed');
  // Finished series without imported maps leave questions available for manual fallback.
  await db
    .update(schema.matches)
    .set({ team1Score: mapCount + 1 })
    .where(eq(schema.matches.id, matchId));
  await repo.resolve(season, userId, {}, true);
  expect((await repo.overview(season)).automaticResults?.['player-kills']).toBeUndefined();
  expect((await other.overview(season)).results).toEqual({});
  expect((await other.overview(season)).ranking).toEqual([]);
});
