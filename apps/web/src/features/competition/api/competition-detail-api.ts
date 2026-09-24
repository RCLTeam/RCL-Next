import type { MatchDetail } from '@rcl/contracts';
import type { PlayerDetail, TeamDetail } from '../types/competition.types.js';

export interface CompetitionDetails {
  teams: TeamDetail;
  players: PlayerDetail;
  matches: MatchDetail;
}
const detailCollections = { teams: 'members', players: 'teams', matches: 'games' } as const;

export async function getCompetitionDetail<K extends keyof CompetitionDetails>(
  resource: K,
  id: string,
  signal: AbortSignal
): Promise<CompetitionDetails[K] | null> {
  // Route parameters are already URL-encoded. Preserve that encoding when building the request.
  const response = await fetch(`/api/v1/${resource}/${id}`, { signal, credentials: 'include' });
  if (response.status === 404 || response.status === 422) return null;
  if (!response.ok) throw new Error('Competition detail request failed.');
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('data' in body) ||
    typeof body.data !== 'object' ||
    body.data === null ||
    !Array.isArray((body.data as Record<string, unknown>)[detailCollections[resource]])
  ) {
    throw new Error('Invalid competition detail response.');
  }
  return body.data as CompetitionDetails[K];
}
