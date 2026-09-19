import { brandAssets } from '../../../shared/resources/assets.js';
import { PlayerLeaderboards } from '../components/PlayerLeaderboards.js';
import './players.css';
import React from 'react';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { SiteLink } from '../../site/navigation.js';
export function PlayersPage() {
  return (
    <PageLayout
      id="jugadores"
      number="06"
      title="Jugadores"
      subtitle="Protagonistas de la rebelión"
      description="Perfiles, plantillas y estadísticas de quienes construyen el legado de RCL."
      toolbar={
        <>
          <span className="meta">Comunidad RCL</span>
          <span className="availability">Próximamente</span>
        </>
      }
    >
      <div className="profile-preview">
        <img src={brandAssets.rebellion} alt="" loading="lazy" />
        <div>
          <span className="eyebrow">Cada jugador tiene una historia</span>
          <h3>Deja tu marca.</h3>
          <p>
            Los perfiles, las plantillas y las estadísticas individuales se publicarán aquí cuando
            estén disponibles.
          </p>
          <SiteLink href="/equipos" className="btn-ghost">
            Explorar equipos →
          </SiteLink>
        </div>
      </div>
      <PlayerLeaderboards />
      <section className="ranking-panel" aria-labelledby="mvp-poll-title">
        <h2 id="mvp-poll-title" className="eyebrow">
          Encuesta · MVP del partido
        </h2>
        <p className="section-intro">
          La votación del MVP se publicará aquí cuando esté disponible.
        </p>
      </section>
    </PageLayout>
  );
}
