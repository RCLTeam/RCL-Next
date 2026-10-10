import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { assert, expect, test } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import * as schema from '../../packages/database/src/schema.js';

test('HTTP -> controller -> service -> real repository -> embedded PostgreSQL', async (t) => {
  const client = new PGlite();
  t.onTestFinished(() => client.close());
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
  expect(seasons.body.data.length).toBe(1);
  const divisions = await request(app)
    .get(`/api/v1/seasons/${encodeURIComponent(seasons.body.data[0].id)}/divisions`)
    .expect(200);
  expect(divisions.body.data.length).toBe(2);
  const divisionId = divisions.body.data[0].id as string;
  const standings = await request(app).get(`/api/v1/divisions/${divisionId}/standings`).expect(200);
  expect(standings.body.data[0].team.name).toBe('Lobos DEMO');
  expect(standings.body.data[0].wins).toBe(1);
  expect(standings.body.data[0].team.discordRoleId).toBe('910000000000000001');
  expect(standings.body.data[1].losses).toBe(1);
  const teamId = standings.body.data[0].team.id as string;
  const teamList = await request(app).get(`/api/v1/divisions/${divisionId}/teams`).expect(200);
  expect(teamList.body.data.find((team: { id: string }) => team.id === teamId).slug).toBe(
    'lobos-demo'
  );
  const namedTeam = await request(app).get('/api/v1/teams/lobos-demo').expect(200);
  expect(namedTeam.body.data.id).toBe(teamId);
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
  expect(detail.body.data.name).toBe('Lobos DEMO');
  expect(detail.body.data.isActive).toBe(true);
  await client.query('UPDATE teams SET is_active = false WHERE id = $1', [teamId]);
  const inactiveDetail = await request(app).get(`/api/v1/teams/${teamId}`).expect(200);
  expect(inactiveDetail.body.data.isActive).toBe(false);
  await client.query('UPDATE teams SET is_active = true WHERE id = $1', [teamId]);
  expect(detail.body.data.divisionName).toBe('Premier DEMO');
  expect(detail.body.data.members.length).toBe(7);
  const captain = detail.body.data.members.find(
    (member: { isCaptain: boolean }) => member.isCaptain
  );
  expect(captain.gameName).toBe('Jugador Demo 1');
  const playerId = captain.playerId as string;
  expect(captain.playerSlug).toBe('jugador-demo-1-demo');
  const playerList = await request(app).get('/api/v1/players').expect(200);
  expect(playerList.body.data.length).toBe(20);
  expect(playerList.body.data.every((player: { isMain: boolean }) => player.isMain)).toBeTruthy();
  const divisionPlayers = await request(app)
    .get(`/api/v1/divisions/${divisionId}/players`)
    .expect(200);
  expect(divisionPlayers.body.data.length).toBe(10);
  expect(
    divisionPlayers.body.data.every((player: { isMain: boolean }) => player.isMain)
  ).toBeTruthy();
  const rankedPlayer = divisionPlayers.body.data.find(
    (player: { id: string }) => player.id === playerId
  );
  expect(rankedPlayer.competition.role).toBe('top');
  expect(rankedPlayer.competition.stats.kda).toBe(6);
  expect(rankedPlayer.competition.stats.csPerMinute).toBe(7);
  expect(rankedPlayer.competition.stats.killParticipation).toBe(48);
  expect(rankedPlayer.competition.team.name).toBe('Lobos DEMO');
  const featuredPlayers = divisionPlayers.body.data.filter(
    (player: { competition: { featured: unknown } }) => player.competition.featured
  );
  expect(featuredPlayers.length).toBe(1);
  expect(featuredPlayers[0].competition.featured.roundName).toBe('Jornada 1');
  expect(JSON.stringify(divisionPlayers.body.data).includes('"score"')).toBe(false);
  const otherDivisionPlayers = await request(app)
    .get(`/api/v1/divisions/${divisions.body.data[1].id}/players`)
    .expect(200);
  expect(otherDivisionPlayers.body.data.length).toBe(10);
  expect(
    otherDivisionPlayers.body.data.every(
      (player: { competition: { stats: unknown; featured: unknown } }) =>
        player.competition.stats === null && player.competition.featured === null
    )
  ).toBe(true);
  await request(app)
    .get('/api/v1/divisions/20000000-0000-4000-8000-000000000099/players')
    .expect(404);
  const matchMvp = await request(app)
    .get('/api/v1/matches/70000000-0000-4000-8000-000000000001')
    .expect(200);
  expect(matchMvp.body.data.mvpPlayerId).toBe(featuredPlayers[0].id);
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
  expect(samePlayer.competition.role).toBe('mid');
  expect(samePlayer.competition.stats).toBe(null);
  expect(samePlayer.competition.featured).toBe(null);
  expect(samePlayer.competition.mvpMatchIds).toStrictEqual([]);
  // Remove only the fixture membership so the existing profile assertions retain their scope.
  await client.query('DELETE FROM team_memberships WHERE team_id = $1', [otherSeasonTeam.id]);
  expect(playerList.body.data.some((player: { id: string }) => player.id === playerId)).toBe(true);
  const playerDetail = await request(app).get(`/api/v1/players/${playerId}`).expect(200);
  expect(playerDetail.body.data.gameName).toBe('Jugador Demo 1');
  expect(playerDetail.body.data.slug).toBe('jugador-demo-1-demo');
  expect(playerDetail.body.data.teams[0].slug).toBe('lobos-demo');
  const namedPlayer = await request(app).get('/api/v1/players/jugador-demo-1-demo').expect(200);
  expect(namedPlayer.body.data.id).toBe(playerId);
  expect(playerDetail.body.data.isMain).toBe(true);
  expect(playerDetail.body.data.teams.length).toBe(1);
  expect(playerDetail.body.data.teams[0].id).toBe(teamId);
  expect(playerDetail.body.data.teams[0].role).toBe('top');
  expect(playerDetail.body.data.teams[0].isCaptain).toBe(true);
  expect(playerDetail.body.data.teams[0].divisionName).toBe('Premier DEMO');
  expect(playerDetail.body.data.competition.team.name).toBe('Lobos DEMO');
  expect(playerDetail.body.data.competition.stats.games).toBe(1);
  expect(playerDetail.body.data.competition.role).toBe('top');
  expect('puuid' in playerDetail.body.data).toBe(false);
  expect('discordUserId' in playerDetail.body.data).toBe(false);
  expect(playerDetail.body.data.linkedAccounts.length).toBe(1);
  const alternate = playerDetail.body.data.linkedAccounts[0];
  expect(alternate.gameName).toBe('Alternate');
  expect(alternate.isMain).toBe(false);
  expect('discordUserId' in alternate).toBe(false);
  const alternateDetail = await request(app).get(`/api/v1/players/${alternate.slug}`).expect(200);
  expect(alternateDetail.body.data.linkedAccounts.length).toBe(1);
  expect(alternateDetail.body.data.linkedAccounts[0].id).toBe(playerId);
  expect(alternateDetail.body.data.linkedAccounts[0].isMain).toBe(true);
  const [unlinked] = await db
    .insert(schema.players)
    .values({ gameName: 'Sin vínculo' })
    .returning();
  const unlinkedDetail = await request(app).get(`/api/v1/players/${unlinked?.id}`).expect(200);
  expect(unlinkedDetail.body.data.displayName).toBe(null);
  expect(unlinkedDetail.body.data.teams).toStrictEqual([]);
  expect(unlinkedDetail.body.data.linkedAccounts).toStrictEqual([]);
  await request(app).get('/api/v1/players/not-a-uuid').expect(404);
  await request(app).get('/api/v1/players/invalid%21').expect(422);
  await request(app).get('/api/v1/players/40000000-0000-4000-8000-000000000099').expect(404);
  const coach = detail.body.data.members.find(
    (member: { role: string }) => member.role === 'coach'
  );
  expect(coach.name).toBe('Coach sin cuenta');
  expect(coach.gameName).toBe(null);
  expect(detail.body.data.members.some((member: { role: string }) => member.role === 'staff')).toBe(
    true
  );
  expect(JSON.stringify(detail.body.data).includes('puuid')).toBe(false);
  await request(app).get('/api/v1/teams/not-a-uuid').expect(404);
  await request(app).get('/api/v1/teams/invalid%21').expect(422);
  await request(app).get('/api/v1/teams/30000000-0000-4000-8000-000000000099').expect(404);
  const [emptyTeam] = await db
    .insert(schema.teams)
    .values({ name: 'Sin plantilla', seasonDivisionId: divisionId })
    .returning();
  const emptyDetail = await request(app).get(`/api/v1/teams/${emptyTeam?.id}`).expect(200);
  expect(emptyDetail.body.data.members).toStrictEqual([]);
  const calendar = await request(app).get(`/api/v1/divisions/${divisionId}/calendar`).expect(200);
  expect(calendar.body.data.length).toBe(2);
  expect(calendar.body.data[0].round.name).toBe('Jornada 1');
  const completedMatch = calendar.body.data.find(
    (match: { status: string }) => match.status === 'completed'
  );
  const report = await request(app).get(`/api/v1/matches/${completedMatch.slug}`).expect(200);
  expect(report.body.data.homeTeam.id).toBe(teamId);
  expect(report.body.data.games.length).toBe(1);
  expect(report.body.data.games[0].participants.length).toBe(10);
  const metadata = async (path: string) =>
    (
      await request(app)
        .get(`/api/v1/page-metadata?path=${encodeURIComponent(path)}`)
        .expect(200)
    ).body.data;
  const reportMetadata = await metadata(`/partidos/${completedMatch.slug}`);
  expect(reportMetadata.title).toBe(
    `${report.body.data.homeTeam.name} vs ${report.body.data.awayTeam.name}`
  );
  expect(
    reportMetadata.description.startsWith(
      `${report.body.data.homeTeam.name} ${report.body.data.homeScore}–${report.body.data.awayScore} ${report.body.data.awayTeam.name}.`
    )
  ).toBeTruthy();
  expect(reportMetadata.description.includes(report.body.data.divisionName)).toBeTruthy();
  expect((await metadata('/equipos/lobos-demo')).title).toBe('Lobos DEMO');
  expect((await metadata('/equipos/lobos-demo')).description.includes('Premier DEMO')).toBeTruthy();
  expect((await metadata(`/jugadores/${playerDetail.body.data.slug}`)).title).toBe(
    `${playerDetail.body.data.gameName}#${playerDetail.body.data.riotTag}`
  );
  expect((await metadata('/partidos/no-existe')).title).toBe('Página no encontrada');
  expect((await metadata(`/equipos/${teamId.toUpperCase()}`)).title).toBe('Lobos DEMO');
  expect((await metadata(`/jugadores/${playerId.toUpperCase()}`)).title).toBe(
    `${playerDetail.body.data.gameName}#${playerDetail.body.data.riotTag}`
  );
  expect((await metadata(`/partidos/${completedMatch.id.toUpperCase()}`)).title).toBe(
    reportMetadata.title
  );
  const champions = await request(app).get(`/api/v1/divisions/${divisionId}/champions`).expect(200);
  expect(champions.body.data.length).toBe(10);
  const garen = champions.body.data.find((row: { champion: string }) => row.champion === 'Garen');
  expect(garen.games).toBe(1);
  expect(garen.totalGames).toBe(1);
  expect(garen.pickRate).toBe(100);
  expect(garen.winRate).toBe(100);
  expect(Object.keys(garen).sort()).toStrictEqual([
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
  expect(emptyChampions.body.data).toStrictEqual([]);
  await request(app).get('/api/v1/divisions/invalid/champions').expect(422);
  await request(app)
    .get('/api/v1/divisions/40000000-0000-4000-8000-000000000099/champions')
    .expect(404);
  const participant = report.body.data.games[0].participants[0];
  expect(participant.stats.kills).toBe(5);
  expect(participant.stats.goldEarned).toBe(null);
  expect(participant.build.item0).toBe(1001);
  expect(participant.runes.primaryKeystoneId).toBe(8010);
  expect('puuid' in participant).toBe(false);
  expect('createdAt' in participant.stats).toBe(false);
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
  expect(
    multiMap.body.data.games.map((game: { gameNumber: number }) => game.gameNumber)
  ).toStrictEqual([1, 2]);
  const rosterGames = multiMap.body.data.games.filter(
    (game: { winnerTeamId: string | null; participants: { playerId: string; teamId: string }[] }) =>
      game.winnerTeamId &&
      game.participants.some((player) => player.playerId === playerId && player.teamId === teamId)
  ).length;
  expect(rosterGames >= 1).toBeTruthy();
  const roster = await request(app).get(`/api/v1/teams/${teamId}`).expect(200);
  expect(
    roster.body.data.members.find((member: { playerId: string }) => member.playerId === playerId)
      ?.rosterStats.games
  ).toBe(rosterGames);
  const sparse = multiMap.body.data.games[1].participants[0];
  expect(sparse.teamId).toBe(teamId);
  expect(sparse.side).toBe('red');
  expect(sparse.stats.kills).toBe(0);
  expect(sparse.stats.goldEarned).toBe(null);
  expect(sparse.build.item0).toBe(0);
  expect(sparse.runes.primaryKeystoneId).toBe(8010);
  const scheduled = calendar.body.data.find(
    (match: { status: string }) => match.status === 'scheduled'
  );
  const afterMaps = await request(app).get(`/api/v1/divisions/${divisionId}/champions`).expect(200);
  expect(afterMaps.body.data[0].champion).toBe('Ahri');
  expect(afterMaps.body.data[0].games).toBe(2);
  expect(afterMaps.body.data[0].totalGames).toBe(2);
  expect(
    afterMaps.body.data.find((row: { champion: string }) => row.champion === 'Garen').pickRate
  ).toBe(50);
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
  expect(afterPending.body.data).toStrictEqual(afterMaps.body.data);
  await request(app).get(`/api/v1/matches/${scheduled.id}`).expect(404);
  await request(app).get('/api/v1/matches/no-existe').expect(404);
  await request(app).get('/api/v1/matches/invalid%21').expect(422);
  const ascend = await request(app)
    .get(`/api/v1/divisions/${divisions.body.data[1].id}/standings`)
    .expect(200);
  expect(ascend.body.data[0].played).toBe(0);
  await db
    .insert(schema.seasons)
    .values([
      { name: 'Undated' },
      { name: 'Older', startsOn: '2040-01-01' },
      { name: 'Recent B', startsOn: '2060-01-01' },
      { name: 'Recent A', startsOn: '2060-01-01' }
    ]);
  const ordered = await request(app).get('/api/v1/seasons').expect(200);
  expect(ordered.body.data.map((season: { name: string }) => season.name)).toStrictEqual([
    'Recent A',
    'Recent B',
    'Temporada DEMO — datos ficticios',
    'Older',
    'Otra temporada',
    'Undated'
  ]);
  expect(ordered.body.data.some((season: object) => 'isActive' in season)).toBe(false);
});
