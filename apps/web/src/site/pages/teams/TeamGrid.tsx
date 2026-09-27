import React from 'react';
import { TeamCard } from '../../../features/competition/components/TeamCard.js';
import type { Team } from '../../../features/competition/types/competition.types.js';

export interface TeamGridProps {
  teams: Team[];
  divisionName?: string | undefined;
  query: string;
}

export function TeamGrid({ teams, divisionName, query }: TeamGridProps) {
  return (
    <>
      <div className="team-grid">
        {teams.map((team) => (
          <TeamCard key={team.id} team={team} divisionName={divisionName} />
        ))}
      </div>
      {!teams.length && (
        <div className="empty-state">No hay equipos que coincidan con «{query}».</div>
      )}
    </>
  );
}
