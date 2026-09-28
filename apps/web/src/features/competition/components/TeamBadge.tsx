import React, { useState } from 'react';
import { teamLogoBounds } from '../../../shared/resources/team-logo-bounds.js';
import { resolveTeamLogo } from '../../../shared/resources/team-logos.js';
import type { Team } from '../types/competition.types.js';
import './team-badge.css';

interface TeamBadgeProps {
  team?: Team | null | undefined;
}

export function TeamBadge({ team }: TeamBadgeProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = resolveTeamLogo(team?.logoUrl);
  const bounds = url?.startsWith('/images/teams_logo/')
    ? teamLogoBounds[url.slice('/images/teams_logo/'.length)]
    : undefined;
  return (
    <span className="team-badge" aria-hidden="true">
      {url && url !== failedUrl ? (
        <span className="team-logo-viewport">
          <img
            className={bounds ? 'team-logo-normalized' : undefined}
            style={bounds}
            src={url}
            alt=""
            loading="lazy"
            onError={() => setFailedUrl(url)}
          />
        </span>
      ) : (
        (team?.shortName ?? team?.name ?? '?').slice(0, 3).toUpperCase()
      )}
    </span>
  );
}
