import React from 'react';
import { playerRoles } from '../../../shared/resources/player-roles.js';

export function TeamOfTheWeekStrip() {
  return (
    <div className="section totw-strip">
      <div className="eyebrow">Team of the Week · El quinteto de la jornada</div>
      <div className="totw-grid">
        {playerRoles.map((role) => (
          <article className="totw-card" key={role}>
            <span className="role-chip">{role}</span>
            <div className="player-silhouette" aria-hidden="true">
              ♜
            </div>
            <h3>Por anunciar</h3>
            <p>Próxima selección</p>
          </article>
        ))}
      </div>
    </div>
  );
}
