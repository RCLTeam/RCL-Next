import React from 'react';
import { safeStreamUrl } from '../../../features/competition/api/competition-api.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { CompetitionTeaser } from './CompetitionTeaser.js';
import { CrownTeaser } from './CrownTeaser.js';
import { EditorialGrid } from './EditorialGrid.js';
import { HomeFeaturedMatch } from './HomeFeaturedMatch.js';
import { HomeHero } from './HomeHero.js';
import { TeamOfTheWeekStrip } from './TeamOfTheWeekStrip.js';
import '../leagues/league-cards.css';
import './home.css';

export function HomePage({ competition }: { competition: Competition }) {
  const featured =
    competition.calendar.data.find((match) => match.status === 'live') ??
    competition.calendar.data
      .filter((match) => match.status === 'scheduled')
      .sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'))[0];
  const stream = featured?.status === 'live' ? safeStreamUrl(featured.streamUrl) : null;

  return (
    <section id="home" aria-label="Inicio">
      <HomeHero seasonName={competition.season?.name} streamUrl={stream} />
      <HomeFeaturedMatch featured={featured} />
      <TeamOfTheWeekStrip />
      <EditorialGrid />
      <CompetitionTeaser />
      <CrownTeaser />
    </section>
  );
}
