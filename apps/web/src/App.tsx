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
  const isAdmin = ['/admin', '/admin/rofl/upload', '/admin/crud'].includes(path);
  const route = siteRoutes.find((item) => item.path === path);
  React.useEffect(() => {
    document.title = `${isAdmin ? (path === '/admin/crud' ? 'CRUD Operations · Admin' : path === '/admin/rofl/upload' ? 'ROFL Upload · Admin' : 'Admin') : (route?.title ?? 'Página no encontrada')} · Rebel Crown Legacy`;
  }, [route, path, isAdmin]);
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
            {isAdmin ? <AdminPage path={path} wsUrl={wsUrl} /> : <NotFoundPage />}
          </SiteLayout>
        )}
      </NavigationContext.Provider>
    </AuthProvider>
  );
}
