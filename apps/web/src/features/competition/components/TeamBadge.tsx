import React, { useState } from 'react';
import { teamLogoBounds } from '../../../shared/resources/team-logo-bounds.js';
import { resolveTeamLogo } from '../../../shared/resources/team-logos.js';
import type { Team } from '../types/competition.types.js';
import './team-badge.css';

interface TeamBadgeProps {
  team?: Team | null | undefined;
}

const DEFAULT_LOGO_URL = '/images/teams_logo/placeholder.webp';

export function TeamBadge({ team }: TeamBadgeProps) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const resolvedUrl = resolveTeamLogo(team?.logoUrl);
  let activeUrl: string | null = null;
  if (resolvedUrl && !failedUrls.has(resolvedUrl)) {
    activeUrl = resolvedUrl;
  } else if (!failedUrls.has(DEFAULT_LOGO_URL)) {
    activeUrl = DEFAULT_LOGO_URL;
  }

  const bounds = activeUrl?.startsWith('/images/teams_logo/')
    ? teamLogoBounds[activeUrl.slice('/images/teams_logo/'.length)]
    : undefined;

  return (
    <span className="team-badge" aria-hidden="true">
      {activeUrl
        ? (() => {
            const currentUrl = activeUrl;
            return (
              <span className="team-logo-viewport">
                <img
                  className={bounds ? 'team-logo-normalized' : undefined}
                  style={bounds}
                  src={currentUrl}
                  alt=""
                  loading="lazy"
                  onError={() => {
                    setFailedUrls((prev) => new Set(prev).add(currentUrl));
                  }}
                />
              </span>
            );
          })()
        : (team?.shortName ?? team?.name ?? '?').slice(0, 3).toUpperCase()}
    </span>
  );
}
