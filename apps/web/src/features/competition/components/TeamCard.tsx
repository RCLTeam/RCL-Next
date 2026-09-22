import React from 'react';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import type { Team } from '../types/competition.types.js';
import { TeamBadge } from './CompetitionViews.js';

export function TeamCard({ team, divisionName }: { team: Team; divisionName: string | undefined }) {
  return (
    <SiteLink
      className="team-card"
      href={`/equipos/${encodeURIComponent(team.slug ?? team.id)}`}
      aria-label={`Ver equipo ${team.name}`}
    >
      <div className="team-card-art">
        <TeamBadge team={team} />
      </div>
      <div className="team-card-body">
        <span className="meta">{divisionName}</span>
        <h3>{team.name}</h3>
        <span className="team-tag">{team.shortName ?? 'RCL'}</span>
        <span className="team-card-action">Ver equipo →</span>
      </div>
    </SiteLink>
  );
}
