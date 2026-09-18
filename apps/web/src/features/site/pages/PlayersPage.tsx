import React from 'react';
import { PageLayout } from '../components/PageLayout.js';
import { SiteLink } from '../navigation.js';
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
        <img src="/brand/rebellion.png" alt="" loading="lazy" />
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
      <div className="leaderboard-grid">
        {['KDA', 'Oro por minuto', 'Daño por minuto', 'Visión'].map((stat) => (
          <article className="leaderboard-card" key={stat}>
            <h3>{stat}</h3>
            <strong>—</strong>
            <p>Estadísticas pendientes</p>
          </article>
        ))}
      </div>
    </PageLayout>
  );
}
