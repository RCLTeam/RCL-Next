import React from 'react';
import { useAuth } from '../../../features/auth/components/AuthProvider.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { CrystalSeason } from '../../../features/crystal-ball/CrystalSeason.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { CrystalRules } from './CrystalRules.js';
import './crystal-ball.css';

export function CrystalBallPage({ competition }: { competition: Competition }) {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.user.discordId : undefined;
  return (
    <PageLayout
      id="bola-cristal"
      number="09"
      title="Bola de cristal"
      subtitle="El futuro de los playoffs"
      description="Elige a los seis clasificados y anticipa campeones, jugadores y meta. Cada acierto suma un punto."
    >
      <div className="page-toolbar">
        <CompetitionFilters competition={competition} />
      </div>
      {competition.season && competition.division ? (
        <CrystalSeason
          key={`${competition.division.id}/${userId}`}
          divisionId={competition.division.id}
          season={competition.season.name}
          userId={userId}
        />
      ) : (
        <output>
          {competition.seasons.status === 'error'
            ? 'No se pudieron cargar las temporadas.'
            : 'Selecciona una temporada y liga para ver sus predicciones.'}
          <button type="button" onClick={competition.retry}>
            Reintentar
          </button>
        </output>
      )}
      <CrystalRules />
    </PageLayout>
  );
}
