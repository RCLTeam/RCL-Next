import React from 'react';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { CrystalCard } from './CrystalCard.js';
import { SeerRankingPanel } from './SeerRankingPanel.js';
import '../players/ranking-panel.css';
import './crystal-ball.css';

const categories = [
  ['Campeon Rift Premier', 'El equipo que conquistara la maxima categoria.', 'premier'],
  ['Campeon Rift Ascend', 'La proxima generacion que llegara a lo mas alto.', 'ascend'],
  ['MVP de la temporada', 'El jugador que dejara su huella en el split.', null],
  ['Equipo revelacion', 'La sorpresa de la temporada.', null],
  ['Primer eliminado en playoffs', 'El primer desenlace de las eliminatorias.', null]
] as const;

export function CrystalBallPage() {
  return (
    <PageLayout
      id="bola-cristal"
      number="09"
      title="Bola de cristal"
      subtitle="Antes de que empiece"
      description="Pronosticos de temporada completa: campeones, MVP y sorpresas. El desenlace llega al final del split."
      toolbar={
        <>
          <span className="meta">Pronosticos de temporada</span>
          <span className="availability">Proximamente</span>
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
