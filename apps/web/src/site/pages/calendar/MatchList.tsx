import React from 'react';
import { MatchCard } from '../../../features/competition/components/CompetitionViews.js';
import type { Match } from '../../../features/competition/types/competition.types.js';

export function MatchList({ matches }: { matches: Match[] }) {
  return (
    <div className="match-list">
      {matches.length ? (
        matches.map((match) => <MatchCard key={match.id} match={match} />)
      ) : (
        <div className="empty-state">No hay partidos para esta jornada.</div>
      )}
    </div>
  );
}
