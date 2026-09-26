import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import * as schema from '../../packages/database/src/schema.js';

test('HTTP -> controller -> service -> real repository -> embedded PostgreSQL', async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
  });
  const seed = await readFile(
    new URL('../../packages/database/seed/demo.sql', import.meta.url),
    'utf8'
  );
  await client.transaction((tx) => tx.exec(seed));
  const app = createApp({
    repository: new PostgresCompetitionRepository(db),
    checkDatabase: async () => {
      await db.select().from(schema.seasons).limit(1);
    },
    corsOrigin: 'http://localhost:5173'
  });
  await request(app).get('/health/ready').expect(200);
  const seasons = await request(app).get('/api/v1/seasons').expect(200);
  assert.equal(seasons.body.data.length, 1);
  const divisions = await request(app)
    .get(`/api/v1/seasons/${encodeURIComponent(seasons.body.data[0].id)}/divisions`)
    .expect(200);
  assert.equal(divisions.body.data.length, 2);
  const divisionId = divisions.body.data[0].id as string;
  const standings = await request(app).get(`/api/v1/divisions/${divisionId}/standings`).expect(200);
  assert.equal(standings.body.data[0].team.name, 'Lobos DEMO');
  assert.equal(standings.body.data[0].wins, 1);
  assert.equal(standings.body.data[1].losses, 1);
  const teamId = standings.body.data[0].team.id as string;
  const teamList = await request(app).get(`/api/v1/divisions/${divisionId}/teams`).expect(200);
  assert.equal(
    teamList.body.data.find((team: { id: string }) => team.id === teamId).slug,
    'lobos-demo'
  );
  const namedTeam = await request(app).get('/api/v1/teams/lobos-demo').expect(200);
  assert.equal(namedTeam.body.data.id, teamId);
  await db.insert(schema.discordUsers).values([
    { discordId: 'test-coach', username: 'Coach sin cuenta' },
    { discordId: 'test-staff', username: 'Staff sin cuenta' }
  ]);
  await db.insert(schema.teamMemberships).values([
    { teamId, discordUserId: 'test-coach', role: 'coach' },
    { teamId, discordUserId: 'test-staff', role: 'staff' }
  ]);
  await db
    .insert(schema.players)
    .values({ discordUserId: '900000000000000001', gameName: 'Alternate', isMain: false });
  const detail = await request(app).get(`/api/v1/teams/${teamId}`).expect(200);
  assert.equal(detail.body.data.name, 'Lobos DEMO');
  assert.equal(detail.body.data.isActive, true);
  await client.query('UPDATE teams SET is_active = false WHERE id = $1', [teamId]);
  const inactiveDetail = await request(app).get(`/api/v1/teams/${teamId}`).expect(200);
  assert.equal(inactiveDetail.body.data.isActive, false);
  await client.query('UPDATE teams SET is_active = true WHERE id = $1', [teamId]);
  assert.equal(detail.body.data.divisionName, 'Premier DEMO');
  assert.equal(detail.body.data.members.length, 7);
  const captain = detail.body.data.members.find(
    (member: { isCaptain: boolean }) => member.isCaptain
  );
  assert.equal(captain.gameName, 'Jugador Demo 1');
  const playerId = captain.playerId as string;
  assert.equal(captain.playerSlug, 'jugador-demo-1-demo');
  const playerList = await request(app).get('/api/v1/players').expect(200);
  assert.equal(playerList.body.data.length, 21);
  const divisionPlayers = await request(app)
    .get(`/api/v1/divisions/${divisionId}/players`)
    .expect(200);
  assert.equal(divisionPlayers.body.data.length, 11);
  const rankedPlayer = divisionPlayers.body.data.find(
    (player: { id: string }) => player.id === playerId
  );
  assert.equal(rankedPlayer.competition.role, 'top');
  assert.equal(rankedPlayer.competition.stats.kda, 6);
  assert.equal(rankedPlayer.competition.stats.csPerMinute, 7);
  assert.equal(rankedPlayer.competition.stats.killParticipation, 48);
  assert.equal(rankedPlayer.competition.team.name, 'Lobos DEMO');
  const featuredPlayers = divisionPlayers.body.data.filter(
    (player: { competition: { featured: unknown } }) => player.competition.featured
  );
  assert.equal(featuredPlayers.length, 1);
  assert.equal(featuredPlayers[0].competition.featured.roundName, 'Jornada 1');
  assert.equal(JSON.stringify(divisionPlayers.body.data).includes('"score"'), false);
  const otherDivisionPlayers = await request(app)
    .get(`/api/v1/divisions/${divisions.body.data[1].id}/players`)
    .expect(200);
  assert.equal(otherDivisionPlayers.body.data.length, 10);
  assert.equal(
    otherDivisionPlayers.body.data.every(
      (player: { competition: { stats: unknown; featured: unknown } }) =>
        player.competition.stats === null && player.competition.featured === null
    ),
    true
  );
  await request(app)
    .get('/api/v1/divisions/20000000-0000-4000-8000-000000000099/players')
    .expect(404);
  const matchMvp = await request(app)
    .get('/api/v1/matches/70000000-0000-4000-8000-000000000001')
    .expect(200);
  assert.equal(matchMvp.body.data.mvpPlayerId, featuredPlayers[0].id);
  await db.insert(schema.seasons).values({ name: 'Otra temporada' });
  const [otherSeasonDivision] = await db
    .insert(schema.seasonsDivisions)
    .values({
      seasonName: 'Otra temporada',
      divisionName: divisions.body.data[0].name
    })
    .returning();
  assert.ok(otherSeasonDivision);
  const [otherSeasonTeam] = await db
    .insert(schema.teams)
    .values({
      name: 'Otro equipo',
      seasonDivisionId: otherSeasonDivision.id
    })
    .returning();
  assert.ok(otherSeasonTeam);
  await db
    .insert(schema.teamMemberships)
    .values({ teamId: otherSeasonTeam.id, discordUserId: '900000000000000001', role: 'mid' });
  const otherSeasonPlayers = await request(app)
    .get(`/api/v1/divisions/${otherSeasonDivision.id}/players`)
    .expect(200);
  const samePlayer = otherSeasonPlayers.body.data.find(
    (player: { id: string }) => player.id === playerId
  );
  assert.equal(samePlayer.competition.role, 'mid');
  assert.equal(samePlayer.competition.stats, null);
  assert.equal(samePlayer.competition.featured, null);
  assert.deepEqual(samePlayer.competition.mvpMatchIds, []);
  // Remove only the fixture membership so the existing profile assertions retain their scope.
  await client.query('DELETE FROM team_memberships WHERE team_id = $1', [otherSeasonTeam.id]);
  assert.equal(
    playerList.body.data.some((player: { id: string }) => player.id === playerId),
    true
  );
  const playerDetail = await request(app).get(`/api/v1/players/${playerId}`).expect(200);
  assert.equal(playerDetail.body.data.gameName, 'Jugador Demo 1');
  assert.equal(playerDetail.body.data.slug, 'jugador-demo-1-demo');
  assert.equal(playerDetail.body.data.teams[0].slug, 'lobos-demo');
  const namedPlayer = await request(app).get('/api/v1/players/jugador-demo-1-demo').expect(200);
  assert.equal(namedPlayer.body.data.id, playerId);
  assert.equal(playerDetail.body.data.isMain, true);
  assert.equal(playerDetail.body.data.teams.length, 1);
  assert.equal(playerDetail.body.data.teams[0].id, teamId);
  assert.equal(playerDetail.body.data.teams[0].role, 'top');
  assert.equal(playerDetail.body.data.teams[0].isCaptain, true);
  assert.equal(playerDetail.body.data.teams[0].divisionName, 'Premier DEMO');
  assert.equal('puuid' in playerDetail.body.data, false);
  assert.equal('discordUserId' in playerDetail.body.data, false);
  const [unlinked] = await db
    .insert(schema.players)
    .values({ gameName: 'Sin vínculo' })
    .returning();
  const unlinkedDetail = await request(app).get(`/api/v1/players/${unlinked?.id}`).expect(200);
  assert.equal(unlinkedDetail.body.data.displayName, null);
  assert.deepEqual(unlinkedDetail.body.data.teams, []);
  await request(app).get('/api/v1/players/not-a-uuid').expect(404);
  await request(app).get('/api/v1/players/invalid%21').expect(422);
  await request(app).get('/api/v1/players/40000000-0000-4000-8000-000000000099').expect(404);
  const coach = detail.body.data.members.find(
    (member: { role: string }) => member.role === 'coach'
  );
  assert.equal(coach.name, 'Coach sin cuenta');
  assert.equal(coach.gameName, null);
  assert.equal(
    detail.body.data.members.some((member: { role: string }) => member.role === 'staff'),
    true
  );
  assert.equal(JSON.stringify(detail.body.data).includes('puuid'), false);
  await request(app).get('/api/v1/teams/not-a-uuid').expect(404);
  await request(app).get('/api/v1/teams/invalid%21').expect(422);
  await request(app).get('/api/v1/teams/30000000-0000-4000-8000-000000000099').expect(404);
  const [emptyTeam] = await db
    .insert(schema.teams)
    .values({ name: 'Sin plantilla', seasonDivisionId: divisionId })
    .returning();
  const emptyDetail = await request(app).get(`/api/v1/teams/${emptyTeam?.id}`).expect(200);
  assert.deepEqual(emptyDetail.body.data.members, []);
  const calendar = await request(app).get(`/api/v1/divisions/${divisionId}/calendar`).expect(200);
  assert.equal(calendar.body.data.length, 2);
  assert.equal(calendar.body.data[0].round.name, 'Jornada 1');
  const completedMatch = calendar.body.data.find(
    (match: { status: string }) => match.status === 'completed'
  );
  const report = await request(app).get(`/api/v1/matches/${completedMatch.slug}`).expect(200);
  assert.equal(report.body.data.homeTeam.id, teamId);
  assert.equal(report.body.data.games.length, 1);
  assert.equal(report.body.data.games[0].participants.length, 10);
  const champions = await request(app).get(`/api/v1/divisions/${divisionId}/champions`).expect(200);
  assert.equal(champions.body.data.length, 10);
  const garen = champions.body.data.find((row: { champion: string }) => row.champion === 'Garen');
  assert.equal(garen.games, 1);
  assert.equal(garen.totalGames, 1);
  assert.equal(garen.pickRate, 100);
  assert.equal(garen.winRate, 100);
  assert.deepEqual(Object.keys(garen).sort(), [
    'champion',
    'games',
    'losses',
    'pickRate',
    'totalGames',
    'winRate',
    'wins'
  ]);
  const emptyChampions = await request(app)
    .get(`/api/v1/divisions/${divisions.body.data[1].id}/champions`)
    .expect(200);
  assert.deepEqual(emptyChampions.body.data, []);
  await request(app).get('/api/v1/divisions/invalid/champions').expect(422);
  await request(app)
    .get('/api/v1/divisions/40000000-0000-4000-8000-000000000099/champions')
    .expect(404);
  const participant = report.body.data.games[0].participants[0];
  assert.equal(participant.stats.kills, 5);
  assert.equal(participant.stats.goldEarned, null);
  assert.equal(participant.build.item0, 1001);
  assert.equal(participant.runes.primaryKeystoneId, 8010);
  assert.equal('puuid' in participant, false);
  assert.equal('createdAt' in participant.stats, false);
  const [secondMap] = await db
    .insert(schema.matchGames)
    .values({
      matchesId: completedMatch.id,
      gameNumber: 2,
      blueTeamId: completedMatch.awayTeam.id,
      redTeamId: teamId,
      winnerTeamId: teamId,
      durationSeconds: 1500
    })
    .returning();
  assert.ok(secondMap);
  await db.transaction(async (tx) => {
    const [info] = await tx
      .insert(schema.playerGameInfo)
      .values({
        matchGameId: secondMap.id,
        playerId,
        teamId,
        side: 'red',
        champion: 'Ahri',
        position: 'MIDDLE'
      })
      .returning();
    assert.ok(info);
    await tx.insert(schema.playerGameStats).values({ id: info.id });
    await tx.insert(schema.playerGameBuild).values({ id: info.id });
    await tx.insert(schema.playerGameRunes).values({ id: info.id, ...participant.runes });
  });
  const multiMap = await request(app).get(`/api/v1/matches/${completedMatch.id}`).expect(200);
  assert.deepEqual(
    multiMap.body.data.games.map((game: { gameNumber: number }) => game.gameNumber),
    [1, 2]
  );
  const sparse = multiMap.body.data.games[1].participants[0];
  assert.equal(sparse.teamId, teamId);
  assert.equal(sparse.side, 'red');
  assert.equal(sparse.stats.kills, 0);
  assert.equal(sparse.stats.goldEarned, null);
  assert.equal(sparse.build.item0, 0);
  assert.equal(sparse.runes.primaryKeystoneId, 8010);
  const scheduled = calendar.body.data.find(
    (match: { status: string }) => match.status === 'scheduled'
  );
  const afterMaps = await request(app).get(`/api/v1/divisions/${divisionId}/champions`).expect(200);
  assert.equal(afterMaps.body.data[0].champion, 'Ahri');
  assert.equal(afterMaps.body.data[0].games, 2);
  assert.equal(afterMaps.body.data[0].totalGames, 2);
  assert.equal(
    afterMaps.body.data.find((row: { champion: string }) => row.champion === 'Garen').pickRate,
    50
  );
  // Imported games from an unfinished series must not leak into the public statistics.
  const [pendingGame] = await db
    .insert(schema.matchGames)
    .values({
      matchesId: scheduled.id,
      gameNumber: 1,
      blueTeamId: teamId,
      redTeamId: completedMatch.awayTeam.id,
      winnerTeamId: teamId
    })
    .returning();
  assert.ok(pendingGame);
  await db.transaction(async (tx) => {
    const [info] = await tx
      .insert(schema.playerGameInfo)
      .values({
        matchGameId: pendingGame.id,
        playerId,
        teamId,
        side: 'blue',
        champion: 'Ashe'
      })
      .returning();
    assert.ok(info);
    await tx.insert(schema.playerGameStats).values({ id: info.id });
    await tx.insert(schema.playerGameBuild).values({ id: info.id });
    await tx.insert(schema.playerGameRunes).values({ id: info.id, ...participant.runes });
  });
  const afterPending = await request(app)
    .get(`/api/v1/divisions/${divisionId}/champions`)
    .expect(200);
  assert.deepEqual(afterPending.body.data, afterMaps.body.data);
  await request(app).get(`/api/v1/matches/${scheduled.id}`).expect(404);
  await request(app).get('/api/v1/matches/no-existe').expect(404);
  await request(app).get('/api/v1/matches/invalid%21').expect(422);
  const ascend = await request(app)
    .get(`/api/v1/divisions/${divisions.body.data[1].id}/standings`)
    .expect(200);
  assert.equal(ascend.body.data[0].played, 0);
  await db
    .insert(schema.seasons)
    .values([
      { name: 'Undated' },
      { name: 'Older', startsOn: '2040-01-01' },
      { name: 'Recent B', startsOn: '2060-01-01' },
      { name: 'Recent A', startsOn: '2060-01-01' }
    ]);
  const ordered = await request(app).get('/api/v1/seasons').expect(200);
  assert.deepEqual(
    ordered.body.data.map((season: { name: string }) => season.name),
    [
      'Recent A',
      'Recent B',
      'Temporada DEMO — datos ficticios',
      'Older',
      'Otra temporada',
      'Undated'
    ]
  );
  assert.equal(
    ordered.body.data.some((season: object) => 'isActive' in season),
    false
  );
});
