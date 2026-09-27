import React, { type ReactNode, useContext, useState } from 'react';
import { AuthControls } from '../../features/auth/components/AuthControls.js';
import { canAccessAdmin, useAuth } from '../../features/auth/components/AuthProvider.js';
import type { Competition } from '../../features/competition/hooks/useCompetition.js';
import { SuggestionModal } from '../../features/suggestions/components/SuggestionModal.js';
import { SiteLink } from '../../shared/components/SiteLink.js';
import { NavigationContext } from '../../shared/navigation.js';
import { brandAssets } from '../../shared/resources/assets.js';
import { resolveSiteRoute, siteRoutes } from '../routes.js';

export interface SiteLayoutProps {
  children: ReactNode;
  leagueSwitch?: ReactNode;
  competition?: Competition;
}

// Layout styles live beside this component and are composed in site.css.
export function SiteLayout({ children, leagueSwitch, competition }: SiteLayoutProps) {
  return (
    <div className="rcl-site">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <SeasonHud competition={competition} />
      <SiteHeader leagueSwitch={leagueSwitch} />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

function SeasonHud({ competition }: { competition: Competition | undefined }) {
  const live = competition?.calendar.data.find((match) => match.status === 'live');
  return (
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
  );
}

function SiteHeader({ leagueSwitch }: { leagueSwitch: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
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
          <span>{menuOpen ? 'Cerrar' : 'Menú'}</span>
          <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
        </button>
      </div>
      <div className={`nav-bottom ${menuOpen ? 'is-open' : ''}`}>
        <SiteNavigation onNavigate={() => setMenuOpen(false)} />
      </div>
    </header>
  );
}

// aria-current drives the selected-link indicator in site-navigation.css.
function SiteNavigation({ onNavigate }: { onNavigate: () => void }) {
  const { path } = useContext(NavigationContext);
  const navigationPath = resolveSiteRoute(path)?.navigationPath;
  const { state, signingOut } = useAuth();
  return (
    <nav id="site-navigation" aria-label="Navegación principal">
      {siteRoutes.map((route) => (
        <SiteLink
          key={route.path}
          href={route.path}
          aria-current={navigationPath === route.path ? 'page' : undefined}
          onClick={onNavigate}
        >
          {route.title}
        </SiteLink>
      ))}
      {canAccessAdmin(state) && !signingOut && (
        <SiteLink
          href="/admin"
          aria-current={navigationPath === '/admin' ? 'page' : undefined}
          onClick={onNavigate}
        >
          Administración
        </SiteLink>
      )}
    </nav>
  );
}

function SiteFooter() {
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false);

  return (
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
            <h2>Contactos</h2>
            <button
              type="button"
              className="footer-suggestion-btn"
              onClick={() => setSuggestionModalOpen(true)}
            >
              Sugerencias
            </button>
          </div>
          <div>
            <h2>Comunidad</h2>
            <SiteLink href="https://discord.gg/sjBAv2kZ7" target="_blank" rel="noopener noreferrer">
              Discord
            </SiteLink>
            <SiteLink href="https://x.com/RCL_LoL" target="_blank" rel="noopener noreferrer">
              Twitter
            </SiteLink>
            <SiteLink
              href="https://www.youtube.com/channel/UCpoM0WwxycsHxOw4QecxzOA"
              target="_blank"
              rel="noopener noreferrer"
            >
              Youtube
            </SiteLink>
            <SiteLink
              href="https://www.twitch.tv/rcl_lol"
              target="_blank"
              rel="noopener noreferrer"
            >
              Twitch
            </SiteLink>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <span> {new Date().getFullYear()} REBEL CROWN LEGACY</span>
        <span>© GUILLERMO-JAVIER MARTÍNEZ NAVARRO TIENE LOS DERECHOS RESERVADOS.</span>
        <span>RCL NO ESTÁ AFILIADA A RIOT GAMES.</span>
      </div>
      {suggestionModalOpen && <SuggestionModal onClose={() => setSuggestionModalOpen(false)} />}
    </footer>
  );
}
