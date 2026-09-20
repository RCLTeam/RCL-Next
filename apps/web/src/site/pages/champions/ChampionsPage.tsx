import React from 'react';
import { ChampionsTable } from '../../../features/competition/components/ChampionsTable.js';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import './champions.css';

export function ChampionsPage() {
  return (
    <PageLayout
      id="campeones"
      number="07"
      title="Campeones"
      subtitle="Estadísticas de juego"
      description="Pick, ban y porcentaje de victorias de cada campeón en Rift Premier y Rift Ascend."
      toolbar={
        <>
          <span className="meta">Meta de la competición</span>
          <span className="availability">Próximamente</span>
        </>
      }
    >
      <ChampionsTable />
    </PageLayout>
  );
}
