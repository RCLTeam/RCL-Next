import type { ChampionStats } from '@rcl/contracts';
import React, { useState } from 'react';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import { useCollection } from '../../../features/competition/hooks/useCollection.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { useGameCatalog } from '../../../shared/riot/useGameCatalog.js';
import { ChampionsTable } from './ChampionsTable.js';
import './champions.css';

export function ChampionsPage({ competition }: { competition: Competition }) {
  const [revision, setRevision] = useState(0);
  const champions = useCollection<ChampionStats>(
    competition.division
      ? `divisions/${encodeURIComponent(competition.division.id)}/champions`
      : null,
    revision
  );
  const catalog = useGameCatalog();
  const state = resolveCompetitionState(competition, champions);
  return (
    <PageLayout
      id="campeones"
      number="07"
      title="Campeones"
      subtitle="Estadísticas de juego"
      description="Selecciones y victorias de cada campeón en los mapas de la competición."
      toolbar={<CompetitionFilters competition={competition} />}
    >
      <DataState
        state={state}
        loadingMessage="Cargando estadísticas de campeones…"
        errorMessage="No se han podido cargar las estadísticas de campeones."
        empty="Todavía no hay mapas finalizados con datos de campeones en esta división."
        retry={() => {
          competition.retry();
          setRevision((value) => value + 1);
        }}
      >
        <ChampionsTable rows={champions.data} catalog={catalog} />
      </DataState>
    </PageLayout>
  );
}
