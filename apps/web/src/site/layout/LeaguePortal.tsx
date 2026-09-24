import React from 'react';
import { DivisionSwitch } from '../../features/competition/components/DivisionSwitch.js';
import { useCompetition } from '../../features/competition/hooks/useCompetition.js';
import type { ResolvedRoute } from '../routes.js';
import { SiteLayout } from './SiteLayout.js';

export function LeaguePortal({
  route,
  wsUrl
}: {
  route: ResolvedRoute;
  wsUrl?: string | undefined;
}) {
  const competition = useCompetition(route.competition);
  return (
    <SiteLayout
      {...(route.competition !== false ? { competition } : {})}
      leagueSwitch={
        route.competition !== false ? <DivisionSwitch competition={competition} /> : undefined
      }
    >
      {route.render({ competition, id: route.parameter, wsUrl })}
    </SiteLayout>
  );
}
