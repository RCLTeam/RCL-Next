import {
  discordUsers,
  divisions,
  matchGames,
  matches,
  playerGameBuild,
  playerGameInfo,
  playerGameRunes,
  playerGameStats,
  players,
  rounds,
  seasons,
  seasonsDivisions,
  teamMemberships,
  teams
} from '@rcl/database';
import type * as schema from '@rcl/database/schema';
import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { CompetitionRepository } from './competition.repository.js';
import { enrichPlayers } from './player-statistics.js';

// Keep the public DTOs stable: season id is now its name; division id is
// the seasons_divisions UUID. Round identifiers are scoped to that UUID.
export class PostgresCompetitionRepository implements CompetitionRepository {
  constructor(private readonly db: PgDatabase<PgQueryResultHKT, typeof schema>) {}
  championPicks(divisionId: string) {
    return this.db
      .select({
        gameId: matchGames.id,
        champion: playerGameInfo.champion,
        teamId: playerGameInfo.teamId,
        winnerTeamId: matchGames.winnerTeamId
      })
      .from(playerGameInfo)
      .innerJoin(matchGames, eq(playerGameInfo.matchGameId, matchGames.id))
      .innerJoin(matches, eq(matchGames.matchesId, matches.id))
      .where(
        and(
          eq(matches.idSeasonDivision, divisionId),
          inArray(matches.status, ['completed', 'forfeit']),
          isNotNull(matchGames.winnerTeamId)
        )
      );
  }
  matchDirectory() {
    return this.db
      .select({
        id: matches.id,
        homeTeamId: matches.team1Id,
        awayTeamId: matches.team2Id,
        roundId: sql<string | null>`${matches.idRound}::text`
      })
      .from(matches);
  }
  async match(id: string) {
    const [row] = await this.db
      .select({ divisionId: matches.idSeasonDivision })
      .from(matches)
      .where(eq(matches.id, id))
      .limit(1);
    return row ? (await this.matches(row.divisionId)).find((match) => match.id === id) : undefined;
  }
  async matchGames(id: string) {
    const games = await this.db
      .select({
        id: matchGames.id,
        gameNumber: matchGames.gameNumber,
        blueTeamId: matchGames.blueTeamId,
        redTeamId: matchGames.redTeamId,
        winnerTeamId: matchGames.winnerTeamId,
        durationSeconds: matchGames.durationSeconds
      })
      .from(matchGames)
      .where(eq(matchGames.matchesId, id))
      .orderBy(asc(matchGames.gameNumber));
    const {
      id: statsId,
      createdAt: statsCreated,
      updatedAt: statsUpdated,
      ...stats
    } = getTableColumns(playerGameStats);
    const {
      id: buildId,
      createdAt: buildCreated,
      updatedAt: buildUpdated,
      ...build
    } = getTableColumns(playerGameBuild);
    const {
      id: runesId,
      createdAt: runesCreated,
      updatedAt: runesUpdated,
      ...runes
    } = getTableColumns(playerGameRunes);
    const participants = await this.db
      .select({
        matchGameId: playerGameInfo.matchGameId,
        id: playerGameInfo.id,
        playerId: players.id,
        gameName: players.gameName,
        riotTag: players.riotTag,
        teamId: playerGameInfo.teamId,
        side: playerGameInfo.side,
        champion: playerGameInfo.champion,
        position: sql<
          string | null
        >`coalesce(${playerGameInfo.position}, ${teamMemberships.role}::text)`,
        stats,
        build,
        runes
      })
      .from(playerGameInfo)
      .innerJoin(matchGames, eq(playerGameInfo.matchGameId, matchGames.id))
      .innerJoin(players, eq(playerGameInfo.playerId, players.id))
      .leftJoin(
        teamMemberships,
        and(
          eq(teamMemberships.discordUserId, players.discordUserId),
          eq(teamMemberships.teamId, playerGameInfo.teamId)
        )
      )
      .leftJoin(playerGameStats, eq(playerGameStats.id, playerGameInfo.id))
      .leftJoin(playerGameBuild, eq(playerGameBuild.id, playerGameInfo.id))
      .leftJoin(playerGameRunes, eq(playerGameRunes.id, playerGameInfo.id))
      .where(eq(matchGames.matchesId, id))
      .orderBy(asc(playerGameInfo.id));
    return games.map((game) => ({
      ...game,
      participants: participants
        .filter((player) => player.matchGameId === game.id)
        .map(({ matchGameId, ...player }) => player)
    }));
  }
  teamDirectory() {
    return this.db
      .select({
        id: teams.id,
        name: teams.name,
        seasonName: seasonsDivisions.seasonName,
        divisionName: seasonsDivisions.divisionName
      })
      .from(teams)
      .innerJoin(seasonsDivisions, eq(teams.seasonDivisionId, seasonsDivisions.id));
  }
  private playerSelection = {
    id: players.id,
    gameName: players.gameName,
    riotTag: players.riotTag,
    countryCode: players.countryCode,
    isMain: players.isMain,
    displayName: sql<string | null>`coalesce(${discordUsers.globalName}, ${discordUsers.username})`
  };
  async players(divisionId?: string) {
    const directory = await this.db
      .select(this.playerSelection)
      .from(players)
      .leftJoin(discordUsers, eq(players.discordUserId, discordUsers.discordId))
      .orderBy(asc(players.gameName), asc(players.riotTag), asc(players.id));
    if (!divisionId) return directory;
    const rows = await this.db
      .select({
        playerId: playerGameInfo.playerId,
        gameId: matchGames.id,
        matchId: matches.id,
        divisionId: matches.idSeasonDivision,
        roundId: matches.idRound,
        teamId: playerGameInfo.teamId,
        team: {
          id: teams.id,
          name: teams.name,
          shortName: teams.shortName,
          logoUrl: teams.logoUrl
        },
        position: sql<
          string | null
        >`coalesce(${playerGameInfo.position}, ${teamMemberships.role}::text)`,
        champion: playerGameInfo.champion,
        durationSeconds: matchGames.durationSeconds,
        winnerTeamId: matchGames.winnerTeamId,
        kills: playerGameStats.kills,
        deaths: playerGameStats.deaths,
        assists: playerGameStats.assists,
        cs: playerGameStats.cs,
        damageToChampions: playerGameStats.damageToChampions,
        visionScore: playerGameStats.visionScore,
        damageMitigated: playerGameStats.damageMitigated
      })
      .from(playerGameInfo)
      .innerJoin(playerGameStats, eq(playerGameStats.id, playerGameInfo.id))
      .innerJoin(players, eq(players.id, playerGameInfo.playerId))
      .leftJoin(
        teamMemberships,
        and(
          eq(teamMemberships.discordUserId, players.discordUserId),
          eq(teamMemberships.teamId, playerGameInfo.teamId)
        )
      )
      .innerJoin(matchGames, eq(matchGames.id, playerGameInfo.matchGameId))
      .innerJoin(matches, eq(matches.id, matchGames.matchesId))
      .innerJoin(teams, eq(teams.id, playerGameInfo.teamId))
      .innerJoin(seasonsDivisions, eq(seasonsDivisions.id, matches.idSeasonDivision))
      .where(
        and(
          eq(matches.idSeasonDivision, divisionId),
          eq(matches.status, 'completed'),
          isNotNull(matchGames.winnerTeamId)
        )
      )
      .orderBy(
        asc(matches.finishedAt),
        asc(matches.scheduledAt),
        asc(matches.id),
        asc(matchGames.gameNumber)
      );
    const scheduledRounds = await this.db
      .select({
        divisionId: rounds.idSeasonDivision,
        id: rounds.id,
        name: rounds.name,
        startsAt: rounds.startsAt
      })
      .from(rounds)
      .innerJoin(seasonsDivisions, eq(seasonsDivisions.id, rounds.idSeasonDivision))
      .where(eq(rounds.idSeasonDivision, divisionId));
    const now = Date.now();
    const currentRounds = [...new Set(scheduledRounds.map((round) => round.divisionId))].flatMap(
      (divisionId) => {
        const candidates = scheduledRounds.filter(
          (round) =>
            round.divisionId === divisionId &&
            ((round.startsAt && round.startsAt.getTime() <= now) ||
              rows.some((row) => row.divisionId === divisionId && row.roundId === round.id))
        );
        candidates.sort(
          (a, b) => (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0) || b.id - a.id
        );
        const round = candidates[0];
        return round ? [{ ...round, name: round.name ?? `Jornada ${round.id}` }] : [];
      }
    );
    const enriched = enrichPlayers(directory, rows, currentRounds);
    // Registered players without games still get their roster role and team.
    const memberships = await this.db
      .select({
        playerId: players.id,
        role: teamMemberships.role,
        team: { id: teams.id, name: teams.name, shortName: teams.shortName, logoUrl: teams.logoUrl }
      })
      .from(players)
      .innerJoin(teamMemberships, eq(teamMemberships.discordUserId, players.discordUserId))
      .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
      .innerJoin(seasonsDivisions, eq(seasonsDivisions.id, teams.seasonDivisionId))
      .where(eq(teams.seasonDivisionId, divisionId))
      .orderBy(asc(teams.id));
    return enriched
      .filter(
        (player) =>
          player.competition?.stats || memberships.some((row) => row.playerId === player.id)
      )
      .map((player) => {
        const membership = memberships.find((row) => row.playerId === player.id);
        if (!player.competition || player.competition.team || !membership) return player;
        return {
          ...player,
          competition: { ...player.competition, role: membership.role, team: membership.team }
        };
      });
  }
  async playerDetail(id: string) {
    const [player] = await this.db
      .select(this.playerSelection)
      .from(players)
      .leftJoin(discordUsers, eq(players.discordUserId, discordUsers.discordId))
      .where(eq(players.id, id))
      .limit(1);
    if (!player) return undefined;
    const memberships = await this.db
      .select({
        id: teams.id,
        name: teams.name,
        shortName: teams.shortName,
        logoUrl: teams.logoUrl,
        seasonName: seasonsDivisions.seasonName,
        divisionName: seasonsDivisions.divisionName,
        role: teamMemberships.role,
        isCaptain: teamMemberships.isCaptain,
        isActive: teams.isActive
      })
      .from(players)
      .innerJoin(teamMemberships, eq(players.discordUserId, teamMemberships.discordUserId))
      .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
      .innerJoin(seasonsDivisions, eq(teams.seasonDivisionId, seasonsDivisions.id))
      .innerJoin(seasons, eq(seasonsDivisions.seasonName, seasons.name))
      .where(eq(players.id, id))
      .orderBy(
        sql`${seasons.startsOn} DESC NULLS LAST`,
        asc(seasons.name),
        asc(teams.name),
        asc(teams.id)
      );
    return { ...player, teams: memberships };
  }
  async teamDetail(id: string) {
    const [team] = await this.db
      .select({
        id: teams.id,
        divisionId: teams.seasonDivisionId,
        name: teams.name,
        shortName: teams.shortName,
        logoUrl: teams.logoUrl,
        color: teams.color,
        isActive: teams.isActive,
        seasonName: seasonsDivisions.seasonName,
        divisionName: seasonsDivisions.divisionName
      })
      .from(teams)
      .innerJoin(seasonsDivisions, eq(teams.seasonDivisionId, seasonsDivisions.id))
      .where(eq(teams.id, id))
      .limit(1);
    if (!team) return undefined;
    // One roster entry per person, preferring their main game account.
    const members = await this.db
      .selectDistinctOn([teamMemberships.discordUserId], {
        id: teamMemberships.discordUserId,
        playerId: players.id,
        name: sql<string>`coalesce(${discordUsers.globalName}, ${discordUsers.username})`,
        role: teamMemberships.role,
        isCaptain: teamMemberships.isCaptain,
        gameName: players.gameName,
        riotTag: players.riotTag,
        countryCode: players.countryCode
      })
      .from(teamMemberships)
      .innerJoin(discordUsers, eq(teamMemberships.discordUserId, discordUsers.discordId))
      .leftJoin(players, eq(players.discordUserId, teamMemberships.discordUserId))
      .where(eq(teamMemberships.teamId, id))
      .orderBy(asc(teamMemberships.discordUserId), desc(players.isMain), asc(players.id));
    return { ...team, members };
  }
  private seasonSelection = {
    id: seasons.name,
    name: seasons.name,
    startsOn: seasons.startsOn,
    endsOn: seasons.endsOn
  };
  seasons() {
    return this.db
      .select(this.seasonSelection)
      .from(seasons)
      .orderBy(sql`${seasons.startsOn} DESC NULLS LAST`, asc(seasons.name));
  }
  async season(name: string) {
    return (
      await this.db
        .select(this.seasonSelection)
        .from(seasons)
        .where(eq(seasons.name, name))
        .limit(1)
    )[0];
  }
  private divisionSelection = {
    id: seasonsDivisions.id,
    seasonId: seasonsDivisions.seasonName,
    code: divisions.name,
    name: divisions.name,
    sortOrder: divisions.sortOrder
  };
  divisions(seasonName: string) {
    return this.db
      .select(this.divisionSelection)
      .from(seasonsDivisions)
      .innerJoin(divisions, eq(divisions.name, seasonsDivisions.divisionName))
      .where(eq(seasonsDivisions.seasonName, seasonName))
      .orderBy(asc(divisions.sortOrder), asc(divisions.name));
  }
  async division(id: string) {
    return (
      await this.db
        .select(this.divisionSelection)
        .from(seasonsDivisions)
        .innerJoin(divisions, eq(divisions.name, seasonsDivisions.divisionName))
        .where(eq(seasonsDivisions.id, id))
        .limit(1)
    )[0];
  }
  teams(divisionId: string) {
    return this.db
      .select({
        id: teams.id,
        divisionId: teams.seasonDivisionId,
        name: teams.name,
        shortName: teams.shortName,
        logoUrl: teams.logoUrl,
        color: teams.color,
        isActive: teams.isActive
      })
      .from(teams)
      .where(eq(teams.seasonDivisionId, divisionId))
      .orderBy(asc(teams.name), asc(teams.id));
  }
  rounds(divisionId: string) {
    return this.db
      .select({
        id: sql<string>`${rounds.id}::text`,
        sequence: rounds.id,
        divisionId: rounds.idSeasonDivision,
        stage: rounds.stage,
        name: rounds.name,
        startsAt: rounds.startsAt,
        lockAt: sql<null>`NULL`
      })
      .from(rounds)
      .where(eq(rounds.idSeasonDivision, divisionId))
      .orderBy(asc(rounds.id));
  }
  matches(divisionId: string) {
    return this.db
      .select({
        id: matches.id,
        divisionId: matches.idSeasonDivision,
        roundId: sql<string | null>`${matches.idRound}::text`,
        homeTeamId: matches.team1Id,
        awayTeamId: matches.team2Id,
        homeScore: matches.team1Score,
        awayScore: matches.team2Score,
        winnerTeamId: matches.winnerTeamId,
        status: matches.status,
        bestOf: matches.bestOf,
        scheduledAt: matches.scheduledAt,
        finishedAt: matches.finishedAt,
        streamUrl: matches.streamUrl
      })
      .from(matches)
      .where(eq(matches.idSeasonDivision, divisionId))
      .orderBy(asc(matches.scheduledAt), asc(matches.id));
  }
}
