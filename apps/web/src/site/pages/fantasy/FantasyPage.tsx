import React from 'react';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { playerRoles } from '../../../shared/resources/player-roles.js';
import { BudgetBar } from './BudgetBar.js';
import { FantasyCard } from './FantasyCard.js';
import { FantasyRankingPanel } from './FantasyRankingPanel.js';
import '../players/ranking-panel.css';
import './fantasy.css';

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
      <BudgetBar />
      <p className="section-intro">
        El mercado y la creación de equipos Fantasy todavía no están disponibles.
      </p>
      <div className="fantasy-grid">
        {playerRoles.map((role) => (
          <FantasyCard key={role} role={role} />
        ))}
      </div>
      <FantasyRankingPanel />
    </PageLayout>
  );
}
