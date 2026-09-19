import React from 'react';
import { AdminPage } from './features/admin/pages/AdminPage.js';
import { AuthProvider } from './features/auth/components/AuthProvider.js';
import { NotFoundPage } from './features/not-found/pages/NotFoundPage.js';
import { LeaguePortal } from './features/site/LeaguePortal.js';
import { SiteLayout } from './features/site/components/SiteLayout.js';
import { NavigationContext, siteRoutes } from './features/site/navigation.js';
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
    document.title = `${path === '/admin' ? 'Admin' : (route?.title ?? 'Página no encontrada')} · Rebel Crown Legacy`;
  }, [route, path]);
  const navigate = (nextPath: string) => {
    if (nextPath !== window.location.pathname) window.history.pushState({}, '', nextPath);
    setCurrentPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };
  return (
    <AuthProvider>
      <NavigationContext.Provider value={{ path, navigate }}>
        {route ? (
          <LeaguePortal path={route.path} />
        ) : (
          <SiteLayout>
            {path === '/admin' ? <AdminPage wsUrl={wsUrl} /> : <NotFoundPage />}
          </SiteLayout>
        )}
      </NavigationContext.Provider>
    </AuthProvider>
  );
}
