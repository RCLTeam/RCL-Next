import React, { type ReactNode, useContext, useState } from 'react';
import { NavigationContext, SiteLink, siteRoutes } from '../../navigation.js';
import { AuthControls } from '../auth/AuthControls.js';
import type { Competition } from '../competition/hooks/useCompetition.js';
import { brandAssets } from '../resources/assets.js';

export function SiteLayout({
  children,
  leagueSwitch,
  competition
}: { children: ReactNode; leagueSwitch?: ReactNode; competition?: Competition }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { path } = useContext(NavigationContext);
  const live = competition?.calendar.data.find((match) => match.status === 'live');
  return (
    <div className="rcl-site">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <div className="hud-bar">
        <span className="hud-season">
          <i className={live ? 'is-live' : ''} />
          {competition?.season?.name ?? 'RCL · REBEL CROWN LEGACY'}
        </span>
        <span className="hud-motto">
          {live
            ? `EN DIRECTO · ${live.homeTeam?.name ?? 'Por definir'} VS ${live.awayTeam?.name ?? 'Por definir'}`
            : 'LA CORONA NO SE HEREDA, SE CONQUISTA'}
        </span>
      </div>
      <header className="site-header">
        <div className="nav-top">
          <SiteLink className="brand" href="/" aria-label="Rebel Crown Legacy · Inicio">
            <img src={brandAssets.rclLogo} alt="RCL" width="92" height="38" />
          </SiteLink>
          <div className="nav-account">
            <AuthControls />
          </div>
          <button
            className="menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? 'Cerrar' : 'Menú'} <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>
        </div>
        <div className={`nav-bottom ${menuOpen ? 'is-open' : ''}`}>
          <nav id="site-navigation" aria-label="Navegación principal">
            {siteRoutes.map((route) => (
              <SiteLink
                key={route.path}
                href={route.path}
                aria-current={path === route.path ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {route.title}
              </SiteLink>
            ))}
          </nav>
          {leagueSwitch && <div className="nav-tools">{leagueSwitch}</div>}
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <div>
            <img src={brandAssets.rclLogo} alt="Rebel Crown Legacy" width="150" height="64" />
            <p className="meta">
              LA CORONA NO SE HEREDA.
              <br />
              SE CONQUISTA.
            </p>
          </div>
          <div className="footer-links">
            <div>
              <h2>Competición</h2>
              <SiteLink href="/ligas">Ligas RCL</SiteLink>
              <SiteLink href="/calendario">Calendario</SiteLink>
              <SiteLink href="/clasificacion">Clasificación</SiteLink>
              <SiteLink href="/playoffs">Playoffs</SiteLink>
            </div>
            <div>
              <h2>Comunidad</h2>
              <SiteLink href="/equipos">Equipos</SiteLink>
              <SiteLink href="/jugadores">Jugadores</SiteLink>
              <SiteLink href="/campeones">Campeones</SiteLink>
              <SiteLink href="/fantasy">Fantasy RCL</SiteLink>
              <SiteLink href="/predicciones">Predicciones</SiteLink>
              <SiteLink href="/bola-cristal">Bola de Cristal</SiteLink>
              <SiteLink href="/admin">Admin · ROFL Upload</SiteLink>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} REBEL CROWN LEGACY</span>
          <span>RCL NO ESTÁ AFILIADA A RIOT GAMES.</span>
        </div>
      </footer>
    </div>
  );
}
