import type React from 'react';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { resolveTeamLogo, teamLogoDirectory } from '../../../shared/resources/team-logos.js';
import type { Team } from '../types/competition.types.js';
import { TeamBadge } from './TeamBadge.js';

// Optical compensation for narrow or open silhouettes, after alpha-bound normalization.
const cardLogoScale: Record<string, number> = {
  'DRA.webp': 1.12,
  'K020.webp': 1.08,
  'LOT.webp': 1.12,
  'PGA.webp': 1.12,
  'PWT.webp': 1.06,
  'TM.webp': 1.1,
  'VXP.webp': 1.18
};

export function TeamCard({
  team,
  divisionName
}: { team: Team; divisionName?: string | undefined }) {
  const logo = resolveTeamLogo(team.logoUrl);
  const logoScale = logo?.startsWith(teamLogoDirectory)
    ? (cardLogoScale[logo.slice(teamLogoDirectory.length)] ?? 1)
    : 1;
  return (
    <SiteLink
      className="team-card"
      style={
        {
          '--team-color': team.color || 'var(--purple)',
          '--team-logo-scale': logoScale
        } as React.CSSProperties
      }
      href={`/equipos/${encodeURIComponent(team.slug ?? team.id)}`}
      aria-label={`Ver equipo ${team.name}`}
    >
      <div className="team-card-body">
        <span className="team-card-abbreviation">{team.shortName ?? 'RCL'}</span>
        <h3>{team.name}</h3>
      </div>
      <div className="team-card-art">
        <TeamBadge team={team} />
      </div>
      <div className="team-card-footer">
        <span>{divisionName ?? 'Rebel Crown Legacy'}</span>
        <span className="team-card-action" aria-hidden="true">
          Ver equipo
        </span>
      </div>
    </SiteLink>
  );
}
