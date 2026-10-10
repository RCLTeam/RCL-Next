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
  goldEarned: number | null;
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

interface RoleReference {
  cspm: number; // CS/min
  dpm: number; // Dmg/min
  gpm: number; // Gold/min
  vspm: number; // vision/min
  mitigationPm: number; // MitigatedDmg/min
  dpg: number; // Dmg/1kGold
}

const ROLE_REFERENCES: Record<string, RoleReference> = {
  top: { cspm: 7.5, dpm: 650, gpm: 380, vspm: 1.0, mitigationPm: 1100, dpg: 1600 },
  jungle: { cspm: 5.8, dpm: 500, gpm: 360, vspm: 1.5, mitigationPm: 950, dpg: 1350 },
  mid: { cspm: 8.0, dpm: 750, gpm: 420, vspm: 1.1, mitigationPm: 650, dpg: 1750 },
  adc: { cspm: 8.5, dpm: 850, gpm: 450, vspm: 0.9, mitigationPm: 450, dpg: 1850 },
  support: { cspm: 1.2, dpm: 250, gpm: 260, vspm: 2.3, mitigationPm: 650, dpg: 900 }
};

const DEFAULT_REF: RoleReference = {
  cspm: 6.5,
  dpm: 600,
  gpm: 370,
  vspm: 1.2,
  mitigationPm: 750,
  dpg: 1500
};

// Scales a value relative to its reference with smooth, continuous growth
function dynamicScale(value: number | null, reference: number): number {
  if (!value || value <= 0 || reference <= 0) return 0;
  const ratio = value / reference;
  return ratio <= 1 ? ratio : 1 + Math.log2(ratio) * 0.28;
}

// Multidimensional MVP scoring algorithm
export function mvpScore(rows: PlayerGameRow[], all: PlayerGameRow[]) {
  if (!rows.length) return 0;

  const stats = aggregatePlayerStats(rows, all);
  const role = playerRole(rows[0]?.position ?? null);
  const ref = ROLE_REFERENCES[role ?? ''] ?? DEFAULT_REF;

  const timed = rows.filter((row) => row.durationSeconds && row.durationSeconds > 0);
  const minutes = timed.reduce((total, row) => total + (row.durationSeconds ?? 0) / 60, 0);

  if (minutes === 0) return 0;

  // Accumulated totals
  const totalDamage = rows.reduce((total, row) => total + row.damageToChampions, 0);
  const totalGold = rows.reduce((total, row) => total + (row.goldEarned ?? 0), 0);

  // Dynamic metrics per minute and efficiency
  const gpm = totalGold > 0 ? totalGold / minutes : null;
  const dpg = totalGold > 0 ? (totalDamage / totalGold) * 1000 : null;

  const vspm = timed.reduce((total, row) => total + (row.visionScore ?? 0), 0) / minutes;
  const mitigationPm =
    timed.reduce((total, row) => total + (row.damageMitigated ?? 0), 0) / minutes;

  // Scaled scores by dimension
  const kdaScore = dynamicScale(stats.kda, 4.5);
  const kpScore = dynamicScale(stats.killParticipation, 65);
  const dpmScore = dynamicScale(stats.damagePerMinute, ref.dpm);
  const dpgScore = dpg ? dynamicScale(dpg, ref.dpg) : dpmScore; // Fallback a DPM si no hay datos de oro
  const visionScore = dynamicScale(vspm, ref.vspm);
  const csScore = dynamicScale(stats.csPerMinute, ref.cspm);
  const mitigationScore = dynamicScale(mitigationPm, ref.mitigationPm);
  const gpmScore = gpm ? dynamicScale(gpm, ref.gpm) : csScore;

  // Multidimensional weighting
  const scoreKda = 20 * kdaScore;
  const scoreKp = 18 * kpScore;
  const scoreDpm = 14 * dpmScore;
  const scoreDpg = 10 * dpgScore; // Eficiencia de daño por recurso
  const scoreVision = 10 * visionScore;
  const scoreCs = 7 * csScore;
  const scoreMitigation = 6 * mitigationScore;
  const scoreGpm = 5 * gpmScore;
  const scoreWinRate = (stats.winRate / 100) * 10;

  const finalScore =
    scoreKda +
    scoreKp +
    scoreDpm +
    scoreDpg +
    scoreVision +
    scoreCs +
    scoreMitigation +
    scoreGpm +
    scoreWinRate;

  return Math.round(finalScore * 10) / 10;
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
                goldEarned: player.stats.goldEarned,
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

export function mostPlayedChampion(games: PlayerGameRow[]): string | null {
  const championCounts = new Map<string, number>();
  for (const game of games) {
    championCounts.set(game.champion, (championCounts.get(game.champion) ?? 0) + 1);
  }
  // The entries arrive chronologically; the most recently selected champion breaks the tie in the event of a deadlock
  let champion: string | null = null;
  let mostGames = 0;
  for (const game of games) {
    const count = championCounts.get(game.champion) ?? 0;
    if (count >= mostGames) {
      champion = game.champion;
      mostGames = count;
    }
  }
  return champion;
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
    const champion = mostPlayedChampion(games);
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
        champion,
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
