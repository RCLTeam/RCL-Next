import React from 'react';
import { PageLayout } from '../components/PageLayout.js';
import { playerRoles } from '../components/player-roles.js';
export function FantasyPage() {
  return (
    <PageLayout
      id="fantasy"
      number="08"
      title="Fantasy"
      subtitle="Tu equipo. Tu estrategia."
      description="Construye tu quinteto y sigue el rendimiento de tus jugadores favoritos."
      toolbar={
        <>
          <span className="meta">Comunidad RCL</span>
          <span className="availability">Próximamente</span>
        </>
      }
    >
      <div className="budget-bar">
        <div>
          <span className="eyebrow">Construye tu quinteto</span>
          <p>Elige tu estrategia y sigue a tus jugadores favoritos.</p>
        </div>
        <span className="availability">Próximamente</span>
      </div>
      <p className="section-intro">
        El mercado y la creación de equipos Fantasy todavía no están disponibles.
      </p>
      <div className="fantasy-grid">
        {playerRoles.map((role) => (
          <article className="fantasy-card" key={role}>
            <span className="role-chip">{role}</span>
            <div className="fantasy-symbol" aria-hidden="true">
              +
            </div>
            <h3>Tu próximo {role}</h3>
            <p>Plaza por cubrir</p>
          </article>
        ))}
      </div>
    </PageLayout>
  );
}
