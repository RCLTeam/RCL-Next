import React from 'react';
import { RoflUploadPage } from './features/rofl-upload/pages/RoflUploadPage.js';
import { LeaguePortal } from './features/site/LeaguePortal.js';
import { SiteLayout } from './features/site/components/SiteLayout.js';
import { NavigationContext, SiteLink, siteRoutes } from './features/site/navigation.js';
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
  const path = currentPath.replace(/\/$/, '') || '/';
  const route = siteRoutes.find((item) => item.path === path);
  React.useEffect(() => {
    document.title = `${route?.title ?? (path === '/admin/rofl/upload' ? 'ROFL Upload' : 'Página no encontrada')} · Rebel Crown Legacy`;
  }, [path, route]);
  const navigate = (nextPath: string) => {
    if (nextPath !== window.location.pathname) window.history.pushState({}, '', nextPath);
    setCurrentPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };
  return (
    <NavigationContext.Provider value={{ path, navigate }}>
      {route ? (
        <LeaguePortal path={route.path} />
      ) : (
        <SiteLayout>
          <div className="admin-content">
            {currentPath.replace(/\/$/, '') === '/admin/rofl/upload' ? (
              <RoflUploadPage wsUrl={wsUrl} />
            ) : (
              <section className="empty-state not-found">
                <h1>404 — Not Found</h1>
                <p>La página que buscas no existe.</p>
                <SiteLink className="btn-primary" href="/">
                  Volver al inicio
                </SiteLink>
                <SiteLink className="btn-ghost" href="/admin/rofl/upload">
                  Go to ROFL Upload
                </SiteLink>
              </section>
            )}
          </div>
        </SiteLayout>
      )}
    </NavigationContext.Provider>
  );
}
