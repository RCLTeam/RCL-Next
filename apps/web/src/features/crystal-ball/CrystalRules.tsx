import type { CrystalBallData } from '@rcl/contracts';
import React from 'react';

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

const statuses = {
  unconfigured: 'Próximamente',
  upcoming: 'Apertura programada',
  open: 'Predicciones abiertas',
  closed: 'Predicciones cerradas',
  resolved: 'Resultados publicados'
};
const formatDate = (value: string) =>
  new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
export function CrystalRules({ campaign }: { campaign?: CrystalBallData }) {
  return (
    <section aria-label="Reglas de la bola de cristal">
      <div className="format-grid">
        {rules.map(([number, title, text]) => (
          <article className="format-card" key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      {campaign && (
        <div className="crystal-rules-status" data-status={campaign.status}>
          <strong>{statuses[campaign.status]}</strong>
          {campaign.opensAt && (
            <span>
              Apertura · <time dateTime={campaign.opensAt}>{formatDate(campaign.opensAt)}</time>
            </span>
          )}
          {campaign.closesAt && (
            <span>
              Cierre · <time dateTime={campaign.closesAt}>{formatDate(campaign.closesAt)}</time>
            </span>
          )}
          {campaign.status === 'unconfigured' && (
            <span>El periodo de participación se anunciará aquí.</span>
          )}
        </div>
      )}
    </section>
  );
}
