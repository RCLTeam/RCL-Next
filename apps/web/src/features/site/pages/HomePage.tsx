import React from 'react';
import { safeStreamUrl } from '../../competition/competition-api.js';
import type { Competition } from '../../competition/hooks/useCompetition.js';
import { MatchCard } from '../components/CompetitionViews.js';
import { SiteLink } from '../navigation.js';

import { playerRoles } from '../components/player-roles.js';

export function HomePage({ competition }: { competition: Competition }) {
  const featured =
    competition.calendar.data.find((match) => match.status === 'live') ??
    competition.calendar.data
      .filter((match) => match.status === 'scheduled')
      .sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'))[0];
  const stream = featured?.status === 'live' ? safeStreamUrl(featured.streamUrl) : null;
  return (
    <section id="home" aria-label="Inicio">
      <div className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-frame" aria-hidden="true" />
        <div className="hero-body">
          <div className="hero-kicker">
            <span className="status-dot" />
            {competition.season?.name ?? 'REBEL CROWN LEGACY · THE REBELLION'}
          </div>
          <h1>
            LA CORONA
            <br />
            NO SE <em>HEREDA</em>
          </h1>
          <p>
            Una liga construida por rebeldes. Cada equipo lucha por dejar su marca y tomar la corona
            — no es solo un torneo, es una rebelión.
          </p>
          <div className="btn-row">
            {stream ? (
              <a className="btn-primary" href={stream} target="_blank" rel="noreferrer">
                Ver en directo <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <SiteLink className="btn-primary" href="/ligas">
                Descubre las ligas <span aria-hidden="true">↗</span>
              </SiteLink>
            )}
            <SiteLink className="btn-ghost" href="/calendario">
              Ver calendario completo
            </SiteLink>
          </div>
        </div>
        <div className="hero-ticker" aria-hidden="true">
          <div className="hero-ticker-track">
            {[0, 1].map((copy) => (
              <span key={copy}>
                THE REBELLION · LA CORONA NO SE HEREDA, SE CONQUISTA · THE REBELLION · LA CORONA NO
                SE HEREDA, SE CONQUISTA ·&nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="featured-match">
        <span className="eyebrow">
          {featured?.status === 'live' ? 'En directo' : 'Próximo encuentro'}
        </span>
        {featured ? (
          <MatchCard match={featured} />
        ) : (
          <div className="featured-empty">
            <span>Consulta las jornadas y los resultados de la competición.</span>
            <SiteLink href="/calendario" className="text-link">
              Ir al calendario →
            </SiteLink>
          </div>
        )}
      </div>
      <div className="section totw-strip">
        <div className="eyebrow">Team of the Week · El quinteto de la jornada</div>
        <div className="totw-grid">
          {playerRoles.map((role) => (
            <article className="totw-card" key={role}>
              <span className="role-chip">{role}</span>
              <div className="player-silhouette" aria-hidden="true">
                ♜
              </div>
              <h3>Por anunciar</h3>
              <p>Próxima selección</p>
            </article>
          ))}
        </div>
      </div>
      <div className="section">
        <div className="eyebrow">Editorial · Crónica de la Rebelión</div>
        <div className="news-grid">
          <article className="news-hero">
            <span className="news-tag">La comunidad</span>
            <div>
              <h2>
                Tu próxima historia
                <br />
                empieza en la grieta.
              </h2>
              <p>Resultados, protagonistas y momentos que construyen el legado de RCL.</p>
              <span className="meta">Próximamente · Crónicas de la liga</span>
            </div>
          </article>
          <div className="news-side">
            {[
              ['01', 'Competición', 'Sigue el camino de cada equipo', '/clasificacion'],
              ['02', 'Protagonistas', 'Conoce a los equipos de la rebelión', '/equipos'],
              ['03', 'Fantasy', 'Tu quinteto. Tu estrategia.', '/fantasy']
            ].map(([number, tag, title, href]) => (
              <SiteLink className="news-item" href={href} key={number}>
                <span className="news-number">{number}</span>
                <div>
                  <span className="meta">{tag}</span>
                  <h3>{title}</h3>
                  <span className="text-link">Explorar →</span>
                </div>
              </SiteLink>
            ))}
          </div>
        </div>
      </div>
      <div className="section competition-teaser">
        <div className="eyebrow">Competiciones</div>
        <div className="league-grid">
          <LeagueCard name="Rift Premier" subtitle="Elite · Máxima categoría" image="premier" />
          <LeagueCard name="Rift Ascend" subtitle="Ascenso · Cantera competitiva" image="ascend" />
        </div>
      </div>
      <div className="section paper crown-teaser">
        <div>
          <span className="eyebrow">Mecánica de temporada</span>
          <h2>
            El trono
            <br />
            de la corona
          </h2>
          <p>
            Cada victoria deja una huella. Un espacio para los protagonistas de la comunidad y su
            legado.
          </p>
        </div>
        <div className="crown-placeholder">
          <span aria-hidden="true">♛</span>
          <h3>La corona espera</h3>
          <p>La clasificación de coronas todavía no está disponible.</p>
        </div>
      </div>
    </section>
  );
}

function LeagueCard({ name, subtitle, image }: { name: string; subtitle: string; image: string }) {
  return (
    <SiteLink className={`league-card ${image}`} href="/ligas">
      <img src={`/brand/${image}.png`} alt="" loading="lazy" />
      <span className="meta">{subtitle}</span>
      <h3>{name}</h3>
      <p>
        {image === 'premier'
          ? 'La máxima categoría de RCL. Los equipos se disputan la corona temporada tras temporada.'
          : 'La cantera competitiva de RCL. El siguiente capítulo del camino hacia la corona.'}
      </p>
      <span className="text-link">Ver ligas →</span>
    </SiteLink>
  );
}
