import type { CrystalAnswers } from '@rcl/contracts';
import { durationBucket, goldBucket, pentakillBucket } from './crystal-ball-policy.js';

export interface CrystalGame {
  id: string;
  winnerTeamId: string | null;
  durationSeconds: number | null;
}
export interface CrystalStat {
  gameId: string;
  playerId: string;
  teamId: string;
  champion: string;
  position: string | null;
  kills: number;
  assists: number;
  deaths: number;
  isMvp: boolean;
  pentaKills: number | null;
  goldEarned: number | null;
}

// Only complete maps count. Missing optional telemetry leaves its question unresolved.
export function automaticResults(games: CrystalGame[], stats: CrystalStat[]): CrystalAnswers {
  const results: CrystalAnswers = {};
  if (
    !games.length ||
    games.some((g) => !g.winnerTeamId || stats.filter((s) => s.gameId === g.id).length !== 10)
  )
    return results;
  const extreme = (key: string, rows: [string, number][], minimum = false) => {
    if (!rows.length) return;
    const best = (minimum ? Math.min : Math.max)(...rows.map(([, value]) => value));
    results[key] = rows.filter(([, value]) => Math.abs(value - best) < 1e-9).map(([id]) => id);
  };
  const players = [...new Set(stats.map((s) => s.playerId))];
  for (const field of ['kills', 'assists', 'deaths'] as const)
    extreme(
      `player-${field}`,
      players.map((id) => [
        id,
        Math.max(...stats.filter((s) => s.playerId === id).map((s) => s[field]))
      ])
    );
  extreme(
    'player-champions',
    players.map((id) => [
      id,
      new Set(stats.filter((s) => s.playerId === id).map((s) => s.champion.toLowerCase())).size
    ])
  );
  if (games.every((g) => stats.some((s) => s.gameId === g.id && s.isMvp)))
    extreme(
      'player-mvp',
      players.map((id) => [id, stats.filter((s) => s.playerId === id && s.isMvp).length])
    );
  const champions = [...new Set(stats.map((s) => s.champion.toLowerCase()))];
  const championRows = champions.map((id) => ({
    id,
    rows: stats.filter((s) => s.champion.toLowerCase() === id)
  }));
  extreme(
    'champion-picks',
    championRows.map(({ id, rows }) => [id, rows.length])
  );
  for (const field of ['kills', 'assists', 'deaths'] as const)
    extreme(
      `champion-${field}`,
      championRows.map(({ id, rows }) => [
        id,
        rows.reduce((n, row) => n + row[field], 0) / rows.length
      ])
    );
  const rates: [string, number][] = championRows
    .filter(({ rows }) => rows.length >= 3)
    .map(({ id, rows }) => [
      id,
      rows.filter((s) => games.find((g) => g.id === s.gameId)?.winnerTeamId === s.teamId).length /
        rows.length
    ]);
  extreme('champion-best-winrate', rates);
  extreme('champion-worst-winrate', rates, true);
  if (stats.every((s) => s.position))
    extreme(
      'champion-positions',
      championRows.map(({ id, rows }) => [
        id,
        new Set(rows.map((s) => s.position?.toLowerCase())).size
      ])
    );
  if (games.every((g) => g.durationSeconds !== null))
    results['shortest-game'] = [
      durationBucket(Math.min(...games.map((g) => g.durationSeconds ?? 0)))
    ];
  if (stats.every((s) => s.pentaKills !== null))
    results.pentakills = [pentakillBucket(stats.reduce((n, s) => n + (s.pentaKills ?? 0), 0))];
  if (stats.every((s) => s.goldEarned !== null)) {
    const differences = games.map((g) => {
      const totals = new Map<string, number>();
      for (const s of stats.filter((s) => s.gameId === g.id))
        totals.set(s.teamId, (totals.get(s.teamId) ?? 0) + (s.goldEarned ?? 0));
      return Math.max(...totals.values()) - Math.min(...totals.values());
    });
    results['gold-difference'] = [goldBucket(Math.max(...differences))];
  }
  return results;
}
