import React, { useState } from 'react';
import { resolveTeamLogo } from '../../../shared/resources/team-logos.js';
import type { Team } from '../types/competition.types.js';
import './team-badge.css';

export function TeamBadge({ team }: { team: Team | undefined }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = resolveTeamLogo(team?.logoUrl);
  return (
    <span className="team-badge" aria-hidden="true">
      {url && url !== failedUrl ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} />
      ) : (
        (team?.shortName ?? team?.name ?? '?').slice(0, 3).toUpperCase()
      )}
    </span>
  );
}
