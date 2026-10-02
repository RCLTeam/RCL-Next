import React from 'react';
import { TeamCard } from '../../../features/competition/components/TeamCard.js';
import { isActiveTeam } from '../../../features/competition/team-visibility.js';
import type { Team } from '../../../features/competition/types/competition.types.js';

export interface TeamGridProps {
  teams: Team[];
  divisionName?: string | undefined;
  query: string;
}

export function TeamGrid({ teams, divisionName, query }: TeamGridProps) {
  const activeTeams = teams.filter(isActiveTeam);
  return (
    <>
      <div className="team-grid">
        {activeTeams.map((team) => (
          <TeamCard key={team.id} team={team} divisionName={divisionName} />
        ))}
      </div>
      {!activeTeams.length && (
        <div className="empty-state">No hay equipos que coincidan con «{query}».</div>
      )}
    </>
  );
}
