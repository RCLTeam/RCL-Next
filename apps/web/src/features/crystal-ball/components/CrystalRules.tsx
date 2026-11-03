import type { CrystalBallData } from '@rcl/contracts';
import React from 'react';

const formatDate = (value: string) =>
  new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
export function CrystalRules({ campaign }: { campaign?: CrystalBallData }) {
  return (
    <section className="crystal-rules" aria-label="Reglas de la bola de cristal">
      <div className="format-grid">
        <article className="format-card">
          <span>01</span>
          <h3>Elige a los clasificados</h3>
          <p>4 a winner y 2 a loser, sin repetir equipos.</p>
        </article>
        <article className="format-card">
          <span>02</span>
          <h3>Cada acierto cuenta</h3>
          <p>1 punto por acierto; los empates son validos.</p>
        </article>
        <article className="format-card">
          <span>03</span>
          <h3>Horarios</h3>
          {campaign && (campaign.opensAt || campaign.closesAt) ? (
            <div className="crystal-rules-dates">
              {campaign.opensAt && (
                <span>
                  Abre <time dateTime={campaign.opensAt}>{formatDate(campaign.opensAt)}</time>
                </span>
              )}
              {campaign.closesAt && (
                <span>
                  Cierra <time dateTime={campaign.closesAt}>{formatDate(campaign.closesAt)}</time>
                </span>
              )}
            </div>
          ) : (
            <p>Fechas por anunciar.</p>
          )}
        </article>
      </div>
    </section>
  );
}
