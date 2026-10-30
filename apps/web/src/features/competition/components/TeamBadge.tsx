import React, { useState } from 'react';
import { teamLogoBounds } from '../../../shared/resources/team-logo-bounds.js';
import { resolveTeamLogo, teamLogoDirectory } from '../../../shared/resources/team-logos.js';
import type { Team } from '../types/competition.types.js';
import './team-badge.css';

interface TeamBadgeProps {
  team?: Pick<Team, 'name' | 'shortName' | 'logoUrl'> | null | undefined;
}

const DEFAULT_LOGO_URL = `${teamLogoDirectory}placeholder.webp`;

// Optical compensation for narrow or open silhouettes, after alpha-bound normalization.
const teamLogoScale: Record<string, number> = {
  'DRA.webp': 1.12,
  'K020.webp': 1.08,
  'LOT.webp': 1.12,
  'PGA.webp': 1.12,
  'PWT.webp': 1.06,
  'TM.webp': 1.1,
  'VXP.webp': 1.18
};

export function TeamBadge({ team }: TeamBadgeProps) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
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

  const opticalScale =
    activeUrl === resolvedUrl && loadedUrl === activeUrl && activeUrl?.startsWith(teamLogoDirectory)
      ? (teamLogoScale[activeUrl.slice(teamLogoDirectory.length)] ?? 1)
      : 1;

  return (
    <span className="team-badge" aria-hidden="true">
      {activeUrl
        ? (() => {
            const currentUrl = activeUrl;
            return (
              <span
                className="team-logo-viewport"
                style={opticalScale !== 1 ? { transform: `scale(${opticalScale})` } : undefined}
              >
                <img
                  className={bounds ? 'team-logo-normalized' : undefined}
                  style={bounds}
                  src={currentUrl}
                  alt=""
                  loading="lazy"
                  onLoad={() => setLoadedUrl(currentUrl)}
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
