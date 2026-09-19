import { FantasyCard } from '../components/FantasyCard.js';
import './fantasy.css';
import React from 'react';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { playerRoles } from '../../../shared/resources/player-roles.js';
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
        <div className="budget-stats">
          <div>
            <strong>100</strong>
            <span>Fichas de presupuesto</span>
          </div>
          <div>
            <strong>5</strong>
            <span>Roles en tu quinteto</span>
          </div>
        </div>
      </div>
      <p className="section-intro">
        El mercado y la creación de equipos Fantasy todavía no están disponibles.
      </p>
      <div className="fantasy-grid">
        {playerRoles.map((role) => (
          <FantasyCard key={role} role={role} />
        ))}
      </div>
      <section className="ranking-panel" aria-labelledby="fantasy-ranking">
        <h2 className="eyebrow" id="fantasy-ranking">
          Ranking Fantasy
        </h2>
        <p className="section-intro">
          La clasificación de la jornada estará disponible cuando comience Fantasy.
        </p>
      </section>
    </PageLayout>
  );
}
