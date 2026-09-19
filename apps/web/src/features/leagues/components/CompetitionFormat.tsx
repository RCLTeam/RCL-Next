import React from 'react';

export function CompetitionFormat() {
  return (
    <div className="format-grid">
      {[
        [
          '01',
          'Fase regular',
          'Cada serie cuenta. Sigue las jornadas y la evolución de la clasificación.'
        ],
        [
          '02',
          'Playoffs',
          'Consulta los enfrentamientos publicados y los resultados de cada eliminatoria.'
        ],
        ['03', 'La corona', 'El desenlace de una temporada y el comienzo de un nuevo legado.']
      ].map(([number, title, text]) => (
        <article className="format-card" key={number}>
          <span>{number}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}
