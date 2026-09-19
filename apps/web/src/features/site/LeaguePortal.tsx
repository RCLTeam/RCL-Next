import React from 'react';
import { CalendarPage } from '../calendar/pages/CalendarPage.js';
import { ChampionsPage } from '../champions/pages/ChampionsPage.js';
import { DivisionSwitch } from '../competition/components/CompetitionViews.js';
import { useCompetition } from '../competition/hooks/useCompetition.js';
import { CrystalBallPage } from '../crystal-ball/pages/CrystalBallPage.js';
import { FantasyPage } from '../fantasy/pages/FantasyPage.js';
import { HomePage } from '../home/pages/HomePage.js';
import { LeaguesPage } from '../leagues/pages/LeaguesPage.js';
import { PlayersPage } from '../players/pages/PlayersPage.js';
import { PlayoffsPage } from '../playoffs/pages/PlayoffsPage.js';
import { PredictionsPage } from '../predictions/pages/PredictionsPage.js';
import { StandingsPage } from '../standings/pages/StandingsPage.js';
import { TeamsPage } from '../teams/pages/TeamsPage.js';
import { SiteLayout } from './components/SiteLayout.js';
import type { SitePath } from './navigation.js';

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
