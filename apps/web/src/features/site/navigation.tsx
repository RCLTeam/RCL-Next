import React, { type ComponentProps, createContext, useContext } from 'react';

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
  { path: '/playoffs', id: 'playoffs', title: 'Playoffs' },
  { path: '/admin', id: 'admin', title: 'Admin' }
] as const;

export type SitePath = (typeof siteRoutes)[number]['path'];
export const NavigationContext = createContext({ path: '/', navigate: (_path: string) => {} });

export function SiteLink({ href = '/', onClick, ...props }: ComponentProps<'a'>) {
  const { navigate } = useContext(NavigationContext);
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target ||
          props.download
        )
          return;
        if (!href.startsWith('/') || href.startsWith('//')) return;
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}
