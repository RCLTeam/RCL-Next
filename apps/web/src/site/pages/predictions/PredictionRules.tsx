import React from 'react';
import '../leagues/leagues.css';

const rules = [
  ['01', 'Acierta el ganador', 'Suma 1 punto por cada serie en la que aciertes el equipo ganador.'],
  [
    '02',
    'Resultado exacto',
    'Acierta el ganador y el marcador para sumar 3 puntos en total por serie.'
  ],
  [
    '03',
    'Plazo para votar',
    'Vota del lunes a las 00:00 al martes a las 23:59, antes del inicio del partido.'
  ]
] as const;

export function PredictionRules() {
  return (
    <section className="format-grid" aria-label="Reglas de las predicciones">
      {rules.map(([number, title, text]) => (
        <article className="format-card" key={number}>
          <span>{number}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </section>
  );
}
