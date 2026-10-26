import React from 'react';
import '../leagues/leagues.css';

const rules = [
  [
    '01',
    'Elige a los clasificados',
    'Selecciona cuatro equipos para winner bracket y dos para loser bracket en cada liga. Un equipo no puede estar en ambas ramas.'
  ],
  [
    '02',
    'Cada acierto cuenta',
    'Suma un punto por cada equipo en la rama correcta y por cada predicción acertada. En caso de empate se acepta cualquiera de los ganadores.'
  ],
  [
    '03',
    'Antes de los playoffs',
    'Completa y guarda tu bola durante el periodo de participación. Puedes modificarla hasta el cierre, siempre antes del inicio de los playoffs de esa liga.'
  ]
] as const;

export function CrystalRules() {
  return (
    <section className="format-grid" aria-label="Reglas de la bola de cristal">
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
