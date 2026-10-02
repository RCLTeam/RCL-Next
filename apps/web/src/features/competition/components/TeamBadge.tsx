import React, { useState } from 'react';
import { teamLogoBounds } from '../../../shared/resources/team-logo-bounds.js';
import { resolveTeamLogo, teamLogoDirectory } from '../../../shared/resources/team-logos.js';
import type { Team } from '../types/competition.types.js';
import './team-badge.css';

interface TeamBadgeProps {
  team?: Team | null | undefined;
}

const DEFAULT_LOGO_URL = `${teamLogoDirectory}placeholder.webp`;

export function TeamBadge({ team }: TeamBadgeProps) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const resolvedUrl = resolveTeamLogo(team?.logoUrl);
  let activeUrl: string | null = null;
  if (resolvedUrl && !failedUrls.has(resolvedUrl)) {
    activeUrl = resolvedUrl;
  } else if (!failedUrls.has(DEFAULT_LOGO_URL)) {
    activeUrl = DEFAULT_LOGO_URL;
  }

  const bounds = activeUrl?.startsWith(teamLogoDirectory)
    ? teamLogoBounds[activeUrl.slice(teamLogoDirectory.length)]
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
