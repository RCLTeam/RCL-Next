import React from 'react';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { brandAssets } from '../../../shared/resources/assets.js';

export function PlayerProfilePreview() {
  return (
    <div className="profile-preview">
      <img src={brandAssets.rebellion} alt="" loading="lazy" />
      <div>
        <span className="eyebrow">Cada jugador tiene una historia</span>
        <h3>Deja tu marca.</h3>
        <p>
          Los perfiles, las plantillas y las estadísticas individuales se publicarán aquí cuando
          estén disponibles.
        </p>
        <SiteLink href="/equipos" className="btn-ghost">
          Explorar equipos →
        </SiteLink>
      </div>
    </div>
  );
}
