import type React from 'react';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import type { Team } from '../types/competition.types.js';
import { TeamBadge } from './TeamBadge.js';

export function TeamCard({ team }: { team: Team; divisionName?: string | undefined }) {
  return (
    <SiteLink
      className="team-card"
      style={{ '--team-color': team.color || 'var(--panel)' } as React.CSSProperties}
      href={`/equipos/${encodeURIComponent(team.slug ?? team.id)}`}
      aria-label={`Ver equipo ${team.name}`}
    >
      <div className="team-card-art">
        <TeamBadge team={team} />
      </div>
      <div className="team-card-body">
        <span className="team-card-abbreviation">{team.shortName ?? 'RCL'}</span>
        <h3>{team.name}</h3>
      </div>
    </SiteLink>
  );
}
