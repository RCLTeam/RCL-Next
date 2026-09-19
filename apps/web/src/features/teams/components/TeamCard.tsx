import React from 'react';
import { TeamBadge } from '../../competition/components/CompetitionViews.js';
import type { Team } from '../../competition/types/competition.types.js';

export function TeamCard({ team, divisionName }: { team: Team; divisionName: string | undefined }) {
  return (
    <article className="team-card">
      <div className="team-card-art">
        <TeamBadge team={team} />
      </div>
      <div className="team-card-body">
        <span className="meta">{divisionName}</span>
        <h3>{team.name}</h3>
        <span className="team-tag">{team.shortName ?? 'RCL'}</span>
      </div>
    </article>
  );
}
