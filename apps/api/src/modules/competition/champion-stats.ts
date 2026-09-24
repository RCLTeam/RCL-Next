import type { ChampionStats } from '@rcl/contracts';
import type { ChampionPick } from './competition.repository.js';

export function calculateChampionStats(picks: ChampionPick[]): ChampionStats[] {
  const valid = picks.filter((pick) => pick.winnerTeamId && pick.champion.trim());
  const totalGames = new Set(valid.map((pick) => pick.gameId)).size;
  const champions = new Map<string, { champion: string; games: Set<string>; wins: Set<string> }>();
  for (const pick of valid) {
    const champion = pick.champion.trim();
    const key = champion.toLowerCase();
    const row = champions.get(key) ?? {
      champion,
      games: new Set<string>(),
      wins: new Set<string>()
    };
    row.games.add(pick.gameId);
    if (pick.teamId === pick.winnerTeamId) row.wins.add(pick.gameId);
    champions.set(key, row);
  }
  return [...champions.values()]
    .map(({ champion, games, wins }) => ({
      champion,
      games: games.size,
      wins: wins.size,
      losses: games.size - wins.size,
      totalGames,
      pickRate: (games.size / totalGames) * 100,
      winRate: (wins.size / games.size) * 100
    }))
    .sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion));
}
