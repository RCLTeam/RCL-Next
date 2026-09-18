import React from 'react';
import { PageLayout } from '../components/PageLayout.js';

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
          <article className="crystal-card" key={title}>
            {badge && <img className="seer-badge" src={`/brand/${badge}.png`} alt="" />}
            <h2>{title}</h2>
            <p>{description}</p>
            <div className="crystal-pending">
              <span aria-hidden="true">◇</span>
              <span>Pronósticos por abrir</span>
            </div>
          </article>
        ))}
      </div>
      <section className="ranking-panel" aria-labelledby="seer-ranking">
        <h2 id="seer-ranking" className="eyebrow">
          Ranking de videntes
        </h2>
        <p className="section-intro">
          Los resultados y la clasificación se publicarán cuando haya pronósticos resueltos.
        </p>
      </section>
    </PageLayout>
  );
}
