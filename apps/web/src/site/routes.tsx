import React, { type ReactNode } from 'react';
import type {
  Competition,
  CompetitionResource
} from '../features/competition/hooks/useCompetition.js';
import { AdminPage } from './pages/admin/AdminPage.js';
import { CalendarPage } from './pages/calendar/CalendarPage.js';
import { ChampionsPage } from './pages/champions/ChampionsPage.js';
import { CrystalBallPage } from './pages/crystal-ball/CrystalBallPage.js';
import { FantasyPage } from './pages/fantasy/FantasyPage.js';
import { HomePage } from './pages/home/HomePage.js';
import { LeaguesPage } from './pages/leagues/LeaguesPage.js';
import { MatchDetailPage } from './pages/match-details/MatchDetailPage.js';
import { PlayerDetailPage } from './pages/player-details/PlayerDetailPage.js';
import { PlayersPage } from './pages/players/PlayersPage.js';
import { PlayoffsPage } from './pages/playoffs/PlayoffsPage.js';
import { PredictionsPage } from './pages/predictions/PredictionsPage.js';
import { StandingsPage } from './pages/standings/StandingsPage.js';
import { TeamDetailPage } from './pages/team-details/TeamDetailPage.js';
import { TeamsPage } from './pages/teams/TeamsPage.js';

interface RouteProps {
  competition: Competition;
  id: string;
  wsUrl?: string | undefined;
}
interface RouteDefinition {
  path: string;
  id: string;
  title: string;
  competition: readonly CompetitionResource[] | false;
  render: (props: RouteProps) => ReactNode;
}

// Calendar is also consumed by the live-match indicator in the season header.
export const siteRoutes = [
  {
    path: '/',
    id: 'home',
    title: 'Inicio',
    competition: ['calendar'],
    render: ({ competition }) => <HomePage competition={competition} />
  },
  {
    path: '/ligas',
    id: 'ligas',
    title: 'Ligas',
    competition: ['calendar'],
    render: ({ competition }) => <LeaguesPage competition={competition} />
  },
  {
    path: '/calendario',
    id: 'calendario',
    title: 'Calendario',
    competition: ['calendar', 'rounds'],
    render: ({ competition }) => <CalendarPage competition={competition} />
  },
  {
    path: '/clasificacion',
    id: 'clasificacion',
    title: 'Clasificación',
    competition: ['calendar', 'standings'],
    render: ({ competition }) => <StandingsPage competition={competition} />
  },
  {
    path: '/equipos',
    id: 'equipos',
    title: 'Equipos',
    competition: ['calendar', 'teams'],
    render: ({ competition }) => <TeamsPage competition={competition} />
  },
  {
    path: '/jugadores',
    id: 'jugadores',
    title: 'Jugadores',
    competition: ['calendar'],
    render: ({ competition }) => <PlayersPage competition={competition} />
  },
  {
    path: '/campeones',
    id: 'campeones',
    title: 'Campeones',
    competition: ['calendar'],
    render: ({ competition }) => <ChampionsPage competition={competition} />
  },
  {
    path: '/fantasy',
    id: 'fantasy',
    title: 'Fantasy',
    competition: ['calendar'],
    render: () => <FantasyPage />
  },
  {
    path: '/predicciones',
    id: 'predicciones',
    title: 'Predicciones',
    competition: ['calendar'],
    render: ({ competition }) => <PredictionsPage competition={competition} />
  },
  {
    path: '/bola-cristal',
    id: 'bola-cristal',
    title: 'Bola de Cristal',
    competition: ['calendar'],
    render: () => <CrystalBallPage />
  },
  {
    path: '/playoffs',
    id: 'playoffs',
    title: 'Playoffs',
    competition: ['calendar', 'rounds'],
    render: ({ competition }) => <PlayoffsPage competition={competition} />
  }
] satisfies RouteDefinition[];

const detailRoutes = [
  {
    path: '/editorial',
    id: 'editorial-detail',
    title: 'Editorial',
    competition: ['calendar'],
    render: ({ id, competition }) => <HomePage competition={competition} articleId={id} />
  },
  {
    path: '/equipos',
    id: 'team-detail',
    title: 'Equipo',
    competition: false,
    render: ({ id }) => <TeamDetailPage key={id} teamId={id} />
  },
  {
    path: '/jugadores',
    id: 'player-detail',
    title: 'Jugador',
    competition: false,
    render: ({ id }) => <PlayerDetailPage key={id} playerId={id} />
  },
  {
    path: '/partidos',
    id: 'match-detail',
    title: 'Partido',
    competition: false,
    render: ({ id }) => <MatchDetailPage key={id} matchId={id} />
  }
] satisfies RouteDefinition[];

export const adminRoutes = [
  { path: '/admin/home-content', title: 'Contenido de la home' },
  { path: '/admin', title: 'Admin' },
  { path: '/admin/rofl/upload', title: 'ROFL Upload' },
  { path: '/admin/crud', title: 'CRUD Operations' },
  { path: '/admin/member-roles', title: 'Gestión de roles' },
  { path: '/admin/database-transfer', title: 'Database Transfer' }
];

export interface ResolvedRoute extends RouteDefinition {
  parameter: string;
  navigationPath: string;
}

export function resolveSiteRoute(path: string): ResolvedRoute | undefined {
  const normalized = path.replace(/\/$/, '') || '/';
  const page = siteRoutes.find((route) => route.path === normalized);
  if (page) return { ...page, parameter: '', navigationPath: page.path };
  for (const detail of detailRoutes) {
    const prefix = `${detail.path}/`;
    if (!normalized.startsWith(prefix)) continue;
    const parameter = normalized.slice(prefix.length);
    if (parameter && !parameter.includes('/')) {
      return {
        ...detail,
        parameter,
        navigationPath: detail.id === 'match-detail' ? '/calendario' : detail.path
      };
    }
  }
  const admin = adminRoutes.find((route) => route.path === normalized);
  if (admin)
    return {
      ...admin,
      id: 'admin',
      title: admin.path === '/admin' ? 'Admin' : `${admin.title} · Admin`,
      competition: false,
      parameter: '',
      navigationPath: '/admin',
      render: ({ wsUrl }) => <AdminPage path={admin.path} wsUrl={wsUrl} />
    };
  return undefined;
}
