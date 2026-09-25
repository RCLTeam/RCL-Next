import React from 'react';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { CrystalCard } from './CrystalCard.js';
import { SeerRankingPanel } from './SeerRankingPanel.js';
import '../players/ranking-panel.css';
import './crystal-ball.css';

const categories = [
  ['Campeón Rift Premier', 'El equipo que conquistará la máxima categoría.', 'premier'],
  ['Campeón Rift Ascend', 'La próxima generación que llegará a lo más alto.', 'ascend'],
  ['MVP de la temporada', 'El jugador que dejará su huella en el split.', null],
  ['Equipo revelación', 'La sorpresa de la temporada.', null],
  ['Primer eliminado en playoffs', 'El primer desenlace de las eliminatorias.', null]
] as const;

export function CrystalBallPage() {
  return (
    <PageLayout
      id="bola-cristal"
      number="10"
      title="Bola de cristal"
      subtitle="Antes de que empiece"
      description="Pronósticos de temporada completa: campeones, MVP y sorpresas. El desenlace llega al final del split."
      toolbar={
        <>
          <span className="meta">Pronósticos de temporada</span>
          <span className="availability">Próximamente</span>
        </>
      }
    >
      <div className="crystal-grid">
        {categories.map(([title, description, badge]) => (
          <CrystalCard key={title} title={title} description={description} badge={badge} />
        ))}
      </div>
      <SeerRankingPanel />
    </PageLayout>
  );
}
