import React, { useEffect, useRef } from 'react';
import { safeStreamUrl } from '../../../features/competition/api/competition-api.js';
import { DivisionSwitch } from '../../../features/competition/components/DivisionSwitch.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { EditorialPage } from '../editorial/EditorialPage.js';
import { EditorialGrid } from './EditorialGrid.js';
import { HomeFeaturedMatch } from './HomeFeaturedMatch.js';
import { HomeHero } from './HomeHero.js';
import { TeamOfTheWeekStrip } from './TeamOfTheWeekStrip.js';
import './home.css';

export function HomePage({
  competition,
  articleId
}: { competition: Competition; articleId?: string }) {
  const homeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const home = homeRef.current;
    const header = home?.closest('.rcl-site')?.querySelector<HTMLElement>('.site-header');
    if (!home || !header) return;

    const updateHeaderHeight = () => {
      home.style.setProperty('--home-header-height', `${header.getBoundingClientRect().height}px`);
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const featured =
    competition.calendar.data.find((match) => match.status === 'live') ??
    competition.calendar.data
      .filter((match) => match.status === 'scheduled')
      .sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'))[0];
  const stream = featured?.status === 'live' ? safeStreamUrl(featured.streamUrl) : null;
  return (
    <section ref={homeRef} id="home" aria-label="Inicio">
      <div className="home-division-sticky">
        {(competition.divisions.data.length > 0 || competition.divisions.status === 'error') && (
          <div className="home-division-controls">
            <DivisionSwitch competition={competition} />
            {competition.divisions.status === 'error' && (
              <div role="alert">
                No se pudieron cargar las divisiones.{' '}
                <button type="button" onClick={competition.retry}>
                  Reintentar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <HomeHero seasonName={competition.season?.name} streamUrl={stream} />
      <HomeFeaturedMatch featured={featured} />
      <TeamOfTheWeekStrip competition={competition} />
      <EditorialGrid />
      {articleId && <EditorialPage key={articleId} articleId={articleId} />}
    </section>
  );
}
