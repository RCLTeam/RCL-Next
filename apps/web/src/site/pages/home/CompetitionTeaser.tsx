import React from 'react';
import { DivisionCard } from '../../../features/competition/components/DivisionCard.js';

export function CompetitionTeaser() {
  return (
    <div className="section competition-teaser">
      <div className="eyebrow">Competiciones</div>
      <div className="league-grid">
        <DivisionCard name="Rift Premier" subtitle="Elite · Máxima categoría" image="premier" />
        <DivisionCard name="Rift Ascend" subtitle="Ascenso · Cantera competitiva" image="ascend" />
      </div>
    </div>
  );
}
