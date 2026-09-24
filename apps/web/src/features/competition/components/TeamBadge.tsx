import React, { useState } from 'react';
import { safeStreamUrl } from '../api/competition-api.js';
import type { Team } from '../types/competition.types.js';
import './team-badge.css';

export function TeamBadge({ team }: { team: Team | undefined }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = safeStreamUrl(team?.logoUrl ?? null);
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
