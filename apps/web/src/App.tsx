import { getPageMetadata } from '@rcl/contracts';
import React from 'react';
import { AuthProvider } from './features/auth/components/AuthProvider.js';
import { browserNavigation } from './shared/browser-navigation.js';
import { NavigationContext } from './shared/navigation.js';
import { LeaguePortal } from './site/layout/LeaguePortal.js';
import { PageHead } from './site/layout/PageHead.js';
import { SiteLayout } from './site/layout/SiteLayout.js';
import './site/layout/site.css';
import { NotFoundPage } from './site/pages/not-found/NotFoundPage.js';
import { resolveSiteRoute } from './site/routes.js';

export interface AppProps {
  initialPath?: string | undefined;
  wsUrl?: string | undefined;
}

export function App({ initialPath, wsUrl }: AppProps) {
  const leaveGuard = React.useRef<(() => boolean) | null>(null);
  const navigation = React.useRef<ReturnType<typeof browserNavigation> | null>(null);
  const setLeaveGuard = React.useCallback((guard: (() => boolean) | null) => {
    leaveGuard.current = guard;
  }, []);
  const [currentPath, setCurrentPath] = React.useState(
    () => initialPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  );
  React.useEffect(() => {
    navigation.current = browserNavigation(setCurrentPath, () => leaveGuard.current?.() ?? true);
    return () => navigation.current?.dispose();
  }, []);
  const requestedPath = currentPath.replace(/\/$/, '') || '/';
  const path = requestedPath;
  const route = resolveSiteRoute(path);
  const metadata = React.useMemo(() => getPageMetadata(path), [path]);
  const title = route?.title ?? 'Página no encontrada';
  // biome-ignore lint/correctness/useExhaustiveDependencies: A new detail URL must reset the previous record's title even when both routes share a title.
  React.useEffect(() => {
    document.title = `${title} · Rebel Crown Legacy`;
  }, [title, path]);
  const navigate = (nextPath: string) => {
    if (!navigation.current?.navigate(nextPath)) return;
    if (
      (path === '/' && nextPath.startsWith('/editorial/')) ||
      (path.startsWith('/editorial/') && nextPath === '/')
    )
      return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };
  return (
    <AuthProvider>
      <NavigationContext.Provider value={{ path, navigate, setLeaveGuard }}>
        <PageHead path={path} metadata={metadata} />
        {route ? (
          <LeaguePortal key={path} route={route} wsUrl={wsUrl} />
        ) : (
          <SiteLayout>
            <NotFoundPage />
          </SiteLayout>
        )}
      </NavigationContext.Provider>
    </AuthProvider>
  );
}
