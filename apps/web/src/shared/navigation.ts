import { createContext, useContext } from 'react';

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
