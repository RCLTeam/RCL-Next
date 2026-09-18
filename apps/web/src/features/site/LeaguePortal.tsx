import React from 'react';
import { useCompetition } from '../competition/hooks/useCompetition.js';
import { CalendarPage } from '../competition/pages/CalendarPage.js';
import { PlayoffsPage } from '../competition/pages/PlayoffsPage.js';
import { StandingsPage } from '../competition/pages/StandingsPage.js';
import { TeamsPage } from '../competition/pages/TeamsPage.js';
import { DivisionSwitch } from './components/CompetitionViews.js';
import { SiteLayout } from './components/SiteLayout.js';
import type { SitePath } from './navigation.js';
import { ChampionsPage } from './pages/ChampionsPage.js';
import { CrystalBallPage } from './pages/CrystalBallPage.js';
import { FantasyPage } from './pages/FantasyPage.js';
import { HomePage } from './pages/HomePage.js';
import { LeaguesPage } from './pages/LeaguesPage.js';
import { PlayersPage } from './pages/PlayersPage.js';
import { PredictionsPage } from './pages/PredictionsPage.js';

export function LeaguePortal({ path }: { path: SitePath }) {
  const competition = useCompetition();
  return (
    <SiteLayout
      competition={competition}
      leagueSwitch={<DivisionSwitch competition={competition} />}
    >
      {path === '/' && <HomePage competition={competition} />}
      {path === '/ligas' && <LeaguesPage competition={competition} />}
      {path === '/calendario' && <CalendarPage competition={competition} />}
      {path === '/clasificacion' && <StandingsPage competition={competition} />}
      {path === '/equipos' && <TeamsPage competition={competition} />}
      {path === '/jugadores' && <PlayersPage />}
      {path === '/campeones' && <ChampionsPage />}
      {path === '/fantasy' && <FantasyPage />}
      {path === '/predicciones' && <PredictionsPage competition={competition} />}
      {path === '/bola-cristal' && <CrystalBallPage />}
      {path === '/playoffs' && <PlayoffsPage competition={competition} />}
    </SiteLayout>
  );
}
