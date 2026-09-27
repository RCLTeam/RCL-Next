import type { MatchMap, Player, PlayerStatistics, TeamSummary } from '@rcl/contracts';

export interface PlayerGameRow {
  playerId: string;
  gameId: string;
  matchId: string;
  divisionId: string;
  roundId: number | null;
  teamId: string;
  team: TeamSummary;
  position: string | null;
  champion: string;
  durationSeconds: number | null;
  winnerTeamId: string | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damageToChampions: number;
  visionScore: number | null;
  damageMitigated: number | null;
}

export function playerRole(position: string | null): string | null {
  const role = position?.toLowerCase();
  if (role === 'middle') return 'mid';
  if (role === 'bottom' || role === 'bot') return 'adc';
  if (role === 'utility' || role === 'sup') return 'support';
  if (role === 'jg' || role === 'jungla') return 'jungle';
  return role ?? null;
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  return groups;
}

export function aggregatePlayerStats(
  rows: PlayerGameRow[],
  all: PlayerGameRow[]
): PlayerStatistics {
  const sum = (key: 'kills' | 'deaths' | 'assists' | 'cs' | 'damageToChampions') =>
    rows.reduce((total, row) => total + row[key], 0);
  const timed = rows.filter((row) => row.durationSeconds && row.durationSeconds > 0);
  const minutes = timed.reduce((total, row) => total + (row.durationSeconds ?? 0) / 60, 0);
  const rate = (key: 'cs' | 'damageToChampions') =>
    minutes ? timed.reduce((total, row) => total + row[key], 0) / minutes : null;
  const average = (key: 'visionScore' | 'damageMitigated') => {
    const values = rows.flatMap((row) => (row[key] === null ? [] : [row[key]]));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const teamKills = rows.reduce(
    (total, row) =>
      total +
      all
        .filter((other) => other.gameId === row.gameId && other.teamId === row.teamId)
        .reduce((kills, other) => kills + other.kills, 0),
    0
  );
  return {
    games: rows.length,
    kda: (sum('kills') + sum('assists')) / Math.max(1, sum('deaths')),
    csPerMinute: rate('cs'),
    killParticipation: teamKills ? (100 * (sum('kills') + sum('assists'))) / teamKills : 0,
    winRate: rows.length
      ? (100 * rows.filter((row) => row.teamId === row.winnerTeamId).length) / rows.length
      : 0,
    damagePerMinute: rate('damageToChampions'),
    visionScore: average('visionScore'),
    damageMitigated: average('damageMitigated')
  };
}

// Bounded contributions avoid runaway KDA and use role-specific reference rates.
// The score stays server-side. Rates and averages do not reward longer series.
export function mvpScore(rows: PlayerGameRow[], all: PlayerGameRow[]) {
  const stats = aggregatePlayerStats(rows, all);
  const role = playerRole(rows[0]?.position ?? null);
  const references: Record<string, [number, number, number, number]> = {
    top: [7, 600, 1, 900],
    jungle: [6, 500, 1.4, 750],
    mid: [8, 750, 1, 450],
    adc: [8, 800, 0.8, 350],
    support: [1.5, 300, 2.5, 600]
  };
  const [cs, damage, vision, mitigation] = references[role ?? ''] ?? [7, 600, 1.2, 600];
  const timed = rows.filter((row) => row.durationSeconds && row.durationSeconds > 0);
  const minutes = timed.reduce((total, row) => total + (row.durationSeconds ?? 0) / 60, 0);
  const perMinute = (key: 'visionScore' | 'damageMitigated') =>
    minutes ? timed.reduce((total, row) => total + (row[key] ?? 0), 0) / minutes : 0;
  const scaled = (value: number | null, reference: number) =>
    Math.min(1, Math.max(0, (value ?? 0) / reference));
  const kda =
    rows.reduce((total, row) => total + row.kills + row.assists, 0) /
    Math.max(
      rows.length,
      rows.reduce((total, row) => total + row.deaths, 0)
    );
  return (
    25 * scaled(kda, 6) +
    25 * scaled(stats.killParticipation, 80) +
    15 * scaled(stats.damagePerMinute, damage) +
    10 * scaled(stats.csPerMinute, cs) +
    10 * scaled(perMinute('visionScore'), vision) +
    10 * scaled(perMinute('damageMitigated'), mitigation) +
    (5 * stats.winRate) / 100
  );
}

export function matchMvps(rows: PlayerGameRow[]) {
  return [...groupBy(rows, (row) => row.matchId)].flatMap(([matchId, games]) => {
    const candidates = [...groupBy(games, (row) => row.playerId)].map(
      ([playerId, playerGames]) => ({
        playerId,
        matchId,
        score: mvpScore(playerGames, games),
        wins: playerGames.filter((row) => row.teamId === row.winnerTeamId).length,
        divisionId: playerGames[0]?.divisionId ?? '',
        roundId: playerGames[0]?.roundId ?? null
      })
    );
    candidates.sort(
      (a, b) => b.score - a.score || b.wins - a.wins || a.playerId.localeCompare(b.playerId)
    );
    return candidates.slice(0, 1);
  });
}

export function matchMvpPlayerId(games: MatchMap[]): string | null {
  const rows = games
    .filter((game) => game.winnerTeamId)
    .flatMap((game) =>
      game.participants.flatMap((player) =>
        player.stats
          ? [
              {
                playerId: player.playerId,
                gameId: game.id,
                matchId: 'match',
                divisionId: '',
                roundId: null,
                teamId: player.teamId,
                team: { id: player.teamId, name: '', shortName: null, logoUrl: null },
                position: player.position,
                champion: player.champion,
                durationSeconds: game.durationSeconds,
                winnerTeamId: game.winnerTeamId,
                kills: player.stats.kills ?? 0,
                deaths: player.stats.deaths ?? 0,
                assists: player.stats.assists ?? 0,
                cs: player.stats.cs ?? 0,
                damageToChampions: player.stats.damageToChampions ?? 0,
                visionScore: player.stats.visionScore,
                damageMitigated: player.stats.damageMitigated
              }
            ]
          : []
      )
    );
  return matchMvps(rows)[0]?.playerId ?? null;
}

export interface CurrentRound {
  divisionId: string;
  id: number;
  name: string;
}

export function enrichPlayers(
  players: Player[],
  rows: PlayerGameRow[],
  rounds: CurrentRound[]
): Player[] {
  const awards = matchMvps(rows);
  const current = awards.filter((award) =>
    rounds.some((round) => round.divisionId === award.divisionId && round.id === award.roundId)
  );
  current.sort(
    (a, b) =>
      b.score - a.score ||
      b.wins - a.wins ||
      a.playerId.localeCompare(b.playerId) ||
      a.matchId.localeCompare(b.matchId)
  );
  const featured = current[0];
  const byPlayer = groupBy(rows, (row) => row.playerId);
  return players.map((player) => {
    const games = byPlayer.get(player.id) ?? [];
    const latest = games.at(-1);
    const round =
      featured?.playerId === player.id
        ? rounds.find(
            (round) => round.divisionId === featured.divisionId && round.id === featured.roundId
          )
        : undefined;
    return {
      ...player,
      competition: {
        role: playerRole(latest?.position ?? null),
        team: latest?.team ?? null,
        champion: latest?.champion ?? null,
        stats: games.length ? aggregatePlayerStats(games, rows) : null,
        mvpMatchIds: awards
          .filter((award) => award.playerId === player.id)
          .map((award) => award.matchId),
        featured: round
          ? {
              roundName: round.name,
              stats: aggregatePlayerStats(
                games.filter(
                  (game) => game.divisionId === round.divisionId && game.roundId === round.id
                ),
                rows
              )
            }
          : null
      }
    };
  });
}
