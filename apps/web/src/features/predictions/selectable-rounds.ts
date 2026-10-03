import type { Round } from '../competition/types/competition.types.js';

const startTime = (round: Round) => (round.startsAt ? new Date(round.startsAt).getTime() : null);

/** Rounds up to the current one, oldest first; future rounds are never selectable. */
export function selectableRounds(rounds: readonly Round[], currentRoundId: string | null): Round[] {
  const current = rounds.find((round) => round.id === currentRoundId);
  const limit = current ? startTime(current) : null;
  if (limit === null) return [];
  return rounds
    .filter((round) => {
      const time = startTime(round);
      return time !== null && time <= limit;
    })
    .sort((a, b) => (startTime(a) ?? 0) - (startTime(b) ?? 0) || a.sequence - b.sequence);
}
