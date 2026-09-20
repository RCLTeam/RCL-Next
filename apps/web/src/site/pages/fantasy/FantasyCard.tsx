import React from 'react';
import { championArt } from '../../../shared/resources/assets.js';

const roleArt: Record<string, string> = {
  top: 'camille',
  jungla: 'lee-sin',
  mid: 'ahri',
  adc: 'jhin',
  support: 'thresh'
};

export function FantasyCard({ role }: { role: string }) {
  return (
    <article className="fantasy-card">
      <div className="fantasy-art">
        <img src={championArt[roleArt[role.toLowerCase()] ?? 'camille']} alt="" loading="lazy" />
        <span className="role-chip">{role}</span>
      </div>
      <div className="fantasy-card-body">
        <h3>Tu próximo {role}</h3>
        <p>Plaza por cubrir</p>
      </div>
    </article>
  );
}
