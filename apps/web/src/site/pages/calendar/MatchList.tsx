import React from 'react';
import { MatchCard } from '../../../features/competition/components/MatchCard.js';
import { isTeamVisibleInCalendar } from '../../../features/competition/team-visibility.js';
import type { Match } from '../../../features/competition/types/competition.types.js';

export function MatchList({ matches }: { matches: Match[] }) {
  const existingMatches = matches.filter(
    (match) => isTeamVisibleInCalendar(match.homeTeam) && isTeamVisibleInCalendar(match.awayTeam)
  );
  return (
    <div className="match-list">
      {existingMatches.length ? (
        existingMatches.map((match) => <MatchCard key={match.id} match={match} />)
      ) : (
        <div className="empty-state">No hay partidos para esta jornada.</div>
      )}
    </div>
  );
}
