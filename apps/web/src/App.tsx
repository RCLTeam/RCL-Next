import React from 'react';
import { LeaguePortal } from './features/site/LeaguePortal.js';
import { NavigationContext, siteRoutes } from './features/site/navigation.js';
import { AdminPage } from './features/site/pages/admin/AdminPage.js';
import { NotFoundPage } from './features/site/pages/not-found/NotFoundPage.js';
import { SiteLayout } from './features/site/shared/components/SiteLayout.js';
import './features/site/site.css';

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
  const path = requestedPath === '/admin/rofl/upload' ? '/admin' : requestedPath;
  const route = siteRoutes.find((item) => item.path === path);
  React.useEffect(() => {
    document.title = `${route?.title ?? 'Página no encontrada'} · Rebel Crown Legacy`;
  }, [route]);
  const navigate = (nextPath: string) => {
    if (nextPath !== window.location.pathname) window.history.pushState({}, '', nextPath);
    setCurrentPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };
  return (
    <NavigationContext.Provider value={{ path, navigate }}>
      {route && route.path !== '/admin' ? (
        <LeaguePortal path={route.path} />
      ) : (
        <SiteLayout>
          {path === '/admin' ? <AdminPage wsUrl={wsUrl} /> : <NotFoundPage />}
        </SiteLayout>
      )}
    </NavigationContext.Provider>
  );
}
