import { createContext, useContext } from 'react';

export const siteRoutes = [
  { path: '/', id: 'home', title: 'Inicio' },
  { path: '/ligas', id: 'ligas', title: 'Ligas' },
  { path: '/calendario', id: 'calendario', title: 'Calendario' },
  { path: '/clasificacion', id: 'clasificacion', title: 'Clasificación' },
  { path: '/equipos', id: 'equipos', title: 'Equipos' },
  { path: '/jugadores', id: 'jugadores', title: 'Jugadores' },
  { path: '/campeones', id: 'campeones', title: 'Campeones' },
  { path: '/fantasy', id: 'fantasy', title: 'Fantasy' },
  { path: '/predicciones', id: 'predicciones', title: 'Predicciones' },
  { path: '/bola-cristal', id: 'bola-cristal', title: 'Bola de Cristal' },
  { path: '/playoffs', id: 'playoffs', title: 'Playoffs' }
] as const;

export type SiteRoutePath = (typeof siteRoutes)[number]['path'];

export type SitePath = SiteRoutePath | '/admin' | '/posiciones' | '/crystal-ball';

export interface NavigationContextValue {
  path: string;
  currentPath?: string;
  navigate: (path: string) => void;
}

// biome-ignore lint/style/useNamingConvention: React context requires PascalCase naming for JSX Provider usage.
export const NavigationContext = createContext<NavigationContextValue>({
  path: '/',
  currentPath: '/',
  navigate: (_path: string) => {}
});

export function useNavigation(): NavigationContextValue {
  return useContext(NavigationContext);
}

export function useNavigate(): (path: string) => void {
  const { navigate } = useContext(NavigationContext);
  return navigate;
}

export function useCurrentPath(): string {
  const { path, currentPath } = useContext(NavigationContext);
  return currentPath ?? path;
}
