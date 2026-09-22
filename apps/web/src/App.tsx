import React from 'react';
import { AuthProvider } from './features/auth/components/AuthProvider.js';
import { NavigationContext, siteRoutes } from './shared/navigation.js';
import { LeaguePortal } from './site/layout/LeaguePortal.js';
import { SiteLayout } from './site/layout/SiteLayout.js';
import './site/layout/site.css';
import { AdminPage } from './site/pages/admin/AdminPage.js';
import { NotFoundPage } from './site/pages/not-found/NotFoundPage.js';

export interface AppProps {
  initialPath?: string | undefined;
  wsUrl?: string | undefined;
}

export function App({ initialPath, wsUrl }: AppProps) {
  const [currentPath, setCurrentPath] = React.useState(
    () => initialPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  );
  React.useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const requestedPath = currentPath.replace(/\/$/, '') || '/';
  const path = requestedPath;
  const isAdmin = [
    '/admin',
    '/admin/rofl/upload',
    '/admin/crud',
    '/admin/member-roles',
    '/admin/database-transfer'
  ].includes(path);
  const route = siteRoutes.find((item) => item.path === path);
  const teamId = /^\/equipos\/([^/]+)$/.exec(path)?.[1];
  const playerId = /^\/jugadores\/([^/]+)$/.exec(path)?.[1];
  const matchId = /^\/partidos\/([^/]+)$/.exec(path)?.[1];
  React.useEffect(() => {
    document.title = `${isAdmin ? (path === '/admin/database-transfer' ? 'Database Transfer · Admin' : path === '/admin/member-roles' ? 'Gestión de roles · Admin' : path === '/admin/crud' ? 'CRUD Operations · Admin' : path === '/admin/rofl/upload' ? 'ROFL Upload · Admin' : 'Admin') : (route?.title ?? 'Página no encontrada')} · Rebel Crown Legacy`;
    if (teamId) document.title = 'Equipo · Rebel Crown Legacy';
    if (playerId) document.title = 'Jugador · Rebel Crown Legacy';
    if (matchId) document.title = 'Partido · Rebel Crown Legacy';
  }, [route, path, isAdmin, teamId, playerId, matchId]);
  const navigate = (nextPath: string) => {
    if (nextPath !== window.location.pathname) window.history.pushState({}, '', nextPath);
    setCurrentPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };
  return (
    <AuthProvider>
      <NavigationContext.Provider value={{ path, navigate }}>
        {route || teamId || playerId || matchId ? (
          <LeaguePortal
            path={route?.path ?? (matchId ? '/calendario' : playerId ? '/jugadores' : '/equipos')}
            teamId={teamId}
            playerId={playerId}
            matchId={matchId}
          />
        ) : (
          <SiteLayout>
            {isAdmin ? <AdminPage path={path} wsUrl={wsUrl} /> : <NotFoundPage />}
          </SiteLayout>
        )}
      </NavigationContext.Provider>
    </AuthProvider>
  );
}
