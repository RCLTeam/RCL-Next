import React from 'react';
import { DivisionSwitch } from '../../features/competition/components/CompetitionViews.js';
import { useCompetition } from '../../features/competition/hooks/useCompetition.js';
import type { SitePath } from '../../shared/navigation.js';
import { CalendarPage } from '../pages/calendar/CalendarPage.js';
import { ChampionsPage } from '../pages/champions/ChampionsPage.js';
import { CrystalBallPage } from '../pages/crystal-ball/CrystalBallPage.js';
import { FantasyPage } from '../pages/fantasy/FantasyPage.js';
import { HomePage } from '../pages/home/HomePage.js';
import { LeaguesPage } from '../pages/leagues/LeaguesPage.js';
import { MatchDetailPage } from '../pages/match-details/MatchDetailPage.js';
import { PlayerDetailPage } from '../pages/player-details/PlayerDetailPage.js';
import { PlayersPage } from '../pages/players/PlayersPage.js';
import { PlayoffsPage } from '../pages/playoffs/PlayoffsPage.js';
import { PredictionsPage } from '../pages/predictions/PredictionsPage.js';
import { StandingsPage } from '../pages/standings/StandingsPage.js';
import { TeamDetailPage } from '../pages/team-details/TeamDetailPage.js';
import { TeamsPage } from '../pages/teams/TeamsPage.js';
import { SiteLayout } from './SiteLayout.js';

export function LeaguePortal({
  path,
  teamId,
  matchId,
  playerId
}: {
  path: SitePath;
  teamId?: string | undefined;
  playerId?: string | undefined;
  matchId?: string | undefined;
}) {
  const competition = useCompetition();
  return (
    <SiteLayout
      {...(!teamId && !matchId && path !== '/jugadores' ? { competition } : {})}
      leagueSwitch={
        teamId || matchId || path === '/jugadores' ? undefined : (
          <DivisionSwitch competition={competition} />
        )
      }
    >
      {path === '/' && <HomePage competition={competition} />}
      {path === '/ligas' && <LeaguesPage competition={competition} />}
      {path === '/calendario' &&
        (matchId ? (
          <MatchDetailPage key={matchId} matchId={matchId} />
        ) : (
          <CalendarPage competition={competition} />
        ))}
      {path === '/clasificacion' && <StandingsPage competition={competition} />}
      {path === '/equipos' &&
        (teamId ? (
          <TeamDetailPage key={teamId} teamId={teamId} />
        ) : (
          <TeamsPage competition={competition} />
        ))}
      {path === '/jugadores' &&
        (playerId ? <PlayerDetailPage key={playerId} playerId={playerId} /> : <PlayersPage />)}
      {path === '/campeones' && <ChampionsPage competition={competition} />}
      {path === '/fantasy' && <FantasyPage />}
      {path === '/predicciones' && <PredictionsPage competition={competition} />}
      {path === '/bola-cristal' && <CrystalBallPage />}
      {path === '/playoffs' && <PlayoffsPage competition={competition} />}
    </SiteLayout>
  );
}
