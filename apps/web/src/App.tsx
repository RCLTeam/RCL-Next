import React from 'react';
import { AuthProvider } from './features/auth/components/AuthProvider.js';
import { NavigationContext } from './shared/navigation.js';
import { LeaguePortal } from './site/layout/LeaguePortal.js';
import { SiteLayout } from './site/layout/SiteLayout.js';
import './site/layout/site.css';
import { NotFoundPage } from './site/pages/not-found/NotFoundPage.js';
import { resolveSiteRoute } from './site/routes.js';

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
  const route = resolveSiteRoute(path);
  const title = route?.title ?? 'Página no encontrada';
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new detail URL must reset the previous record's title even when both routes share a title.
  React.useEffect(() => {
    document.title = `${title} · Rebel Crown Legacy`;
  }, [title, path]);
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
          <LeaguePortal route={route} wsUrl={wsUrl} />
        ) : (
          <SiteLayout>
            <NotFoundPage />
          </SiteLayout>
        )}
      </NavigationContext.Provider>
    </AuthProvider>
  );
}
