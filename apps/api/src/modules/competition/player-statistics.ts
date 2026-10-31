import type { Player, PlayerStatistics, TeamSummary } from '@rcl/contracts';

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

type TeamKills = Map<string, Map<string, number>>;

function teamKillIndex(rows: PlayerGameRow[]): TeamKills {
  const index: TeamKills = new Map();
  for (const row of rows) {
    const teams = index.get(row.gameId) ?? new Map<string, number>();
    teams.set(row.teamId, (teams.get(row.teamId) ?? 0) + row.kills);
    index.set(row.gameId, teams);
  }
  return index;
}

function killsContext(all: PlayerGameRow[] | TeamKills): TeamKills {
  return Array.isArray(all) ? teamKillIndex(all) : all;
}

export function aggregatePlayerStats(
  rows: PlayerGameRow[],
  all: PlayerGameRow[] | TeamKills
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
  const index = killsContext(all);
  const teamKills = rows.reduce(
    (total, row) => total + (index.get(row.gameId)?.get(row.teamId) ?? 0),
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

// Keep full precision until the series award is selected and stored.
export function mapMvpScore(row: PlayerGameRow, all: PlayerGameRow[] | TeamKills) {
  const stats = aggregatePlayerStats([row], all);
  const role = playerRole(row.position);
  const ref = ROLE_REFERENCES[role ?? ''] ?? DEFAULT_REF;

  const minutes = (row.durationSeconds ?? 0) / 60;
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;

  // Accumulated totals
  const totalDamage = row.damageToChampions;
  const totalGold = row.goldEarned ?? 0;

  // Dynamic metrics per minute and efficiency
  const gpm = totalGold > 0 ? totalGold / minutes : null;
  const dpg = totalGold > 0 ? (totalDamage / totalGold) * 1000 : null;

  const vspm = (row.visionScore ?? 0) / minutes;
  const mitigationPm = (row.damageMitigated ?? 0) / minutes;

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

  return finalScore;
}

export function matchMvpScore(rows: PlayerGameRow[], all: PlayerGameRow[] | TeamKills) {
  const timed = rows.filter(
    (row) => Number.isFinite(row.durationSeconds) && (row.durationSeconds ?? 0) > 0
  );
  const seconds = timed.reduce((total, row) => total + (row.durationSeconds ?? 0), 0);
  if (!seconds) return 0;
  const index = killsContext(all);
  return (
    timed.reduce((total, row) => total + mapMvpScore(row, index) * (row.durationSeconds ?? 0), 0) /
    seconds
  );
}

export function mvpScore(rows: PlayerGameRow[], all: PlayerGameRow[] | TeamKills) {
  return Math.round(matchMvpScore(rows, all) * 10) / 10;
}

export interface MvpRanking {
  playerId: string;
  score: number;
  wins: number;
  killParticipation: number;
  kda: number;
  damageToChampions: number;
}

export function compareMvpRanking(a: MvpRanking, b: MvpRanking): number {
  return (
    b.score - a.score ||
    b.wins - a.wins ||
    b.killParticipation - a.killParticipation ||
    b.kda - a.kda ||
    b.damageToChampions - a.damageToChampions ||
    a.playerId.localeCompare(b.playerId)
  );
}

export function playerMvpRanking(
  playerId: string,
  rows: PlayerGameRow[],
  all: PlayerGameRow[] | TeamKills
): MvpRanking {
  const index = killsContext(all);
  const stats = aggregatePlayerStats(rows, index);
  return {
    playerId,
    score: matchMvpScore(rows, index),
    wins: rows.filter((row) => row.teamId === row.winnerTeamId).length,
    killParticipation: stats.killParticipation ?? 0,
    kda: stats.kda,
    damageToChampions: rows.reduce((total, row) => total + row.damageToChampions, 0)
  };
}

export function matchMvps(rows: PlayerGameRow[]) {
  return [...groupBy(rows, (row) => row.matchId)].flatMap(([matchId, games]) => {
    const index = teamKillIndex(games);
    const maps = [...groupBy(games, (row) => row.gameId).values()];
    const teamWins = new Map<string, number>();
    for (const map of maps) {
      const winner = map[0]?.winnerTeamId;
      if (!winner) return [];
      teamWins.set(winner, (teamWins.get(winner) ?? 0) + 1);
    }
    const teams = [...teamWins].sort((a, b) => b[1] - a[1]);
    const winnerTeamId = teams[0]?.[1] === teams[1]?.[1] ? null : teams[0]?.[0];
    const candidates = [...groupBy(games, (row) => row.playerId)].flatMap(
      ([playerId, playerGames]) => {
        if (new Set(playerGames.map((row) => row.gameId)).size * 2 < maps.length) return [];
        if (winnerTeamId && playerGames.some((row) => row.teamId !== winnerTeamId)) return [];
        if (
          playerGames.some(
            (row) => !Number.isFinite(row.durationSeconds) || (row.durationSeconds ?? 0) <= 0
          )
        )
          return [];
        return [
          {
            ...playerMvpRanking(playerId, playerGames, index),
            matchId,
            divisionId: playerGames[0]?.divisionId ?? '',
            roundId: playerGames[0]?.roundId ?? null
          }
        ];
      }
    );
    candidates.sort(compareMvpRanking);
    return candidates
      .slice(0, 1)
      .map(({ killParticipation, kda, damageToChampions, ...award }) => ({
        ...award,
        score: Math.round(award.score * 10) / 10
      }));
  });
}

export interface FeaturedMatchMvp {
  playerId: string;
  divisionId: string;
  roundId: number;
  roundName: string;
}

export interface PersistedMatchMvp {
  playerId: string;
  matchId: string;
}

export function mostPlayedChampion(games: Pick<PlayerGameRow, 'champion'>[]): string | null {
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
  awards: PersistedMatchMvp[],
  featured: FeaturedMatchMvp | null = null
): Player[] {
  const index = teamKillIndex(rows);
  const byPlayer = groupBy(rows, (row) => row.playerId);
  return players.map((player) => {
    const games = byPlayer.get(player.id) ?? [];
    const latest = games.at(-1);
    const champion = mostPlayedChampion(games);
    const round = featured?.playerId === player.id ? featured : null;
    return {
      ...player,
      competition: {
        role: playerRole(latest?.position ?? null),
        team: latest?.team ?? null,
        champion,
        stats: games.length ? aggregatePlayerStats(games, index) : null,
        mvpMatchIds: awards
          .filter((award) => award.playerId === player.id)
          .map((award) => award.matchId),
        featured: round
          ? {
              roundName: round.roundName,
              stats: aggregatePlayerStats(
                games.filter(
                  (game) => game.divisionId === round.divisionId && game.roundId === round.roundId
                ),
                index
              )
            }
          : null
      }
    };
  });
}
