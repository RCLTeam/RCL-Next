import React from 'react';
import { brandAssets } from '../../../shared/resources/assets.js';

export function CrystalCard({
  title,
  description,
  badge
}: { title: string; description: string; badge: string | null }) {
  return (
    <article className="crystal-card">
      {badge && <img className="seer-badge" src={brandAssets[badge]} alt="" />}
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="crystal-pending">
        <span aria-hidden="true">◇</span>
        <span>Pronósticos por abrir</span>
      </div>
    </article>
  );
}
