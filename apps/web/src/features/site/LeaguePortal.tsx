import React from 'react';
import type { SitePath } from './navigation.js';
import { CalendarPage } from './pages/calendar/CalendarPage.js';
import { ChampionsPage } from './pages/champions/ChampionsPage.js';
import { CrystalBallPage } from './pages/crystal-ball/CrystalBallPage.js';
import { FantasyPage } from './pages/fantasy/FantasyPage.js';
import { HomePage } from './pages/home/HomePage.js';
import { LeaguesPage } from './pages/leagues/LeaguesPage.js';
import { PlayersPage } from './pages/players/PlayersPage.js';
import { PlayoffsPage } from './pages/playoffs/PlayoffsPage.js';
import { PredictionsPage } from './pages/predictions/PredictionsPage.js';
import { StandingsPage } from './pages/standings/StandingsPage.js';
import { TeamsPage } from './pages/teams/TeamsPage.js';
import { useCompetition } from './shared/competition/hooks/useCompetition.js';
import { DivisionSwitch } from './shared/components/CompetitionViews.js';
import { SiteLayout } from './shared/components/SiteLayout.js';

export function LeaguePortal({ path }: { path: Exclude<SitePath, '/admin'> }) {
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
