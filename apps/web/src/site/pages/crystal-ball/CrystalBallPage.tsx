import React from 'react';
import { useAuth } from '../../../features/auth/components/AuthProvider.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { CrystalRules } from '../../../features/crystal-ball/components/CrystalRules.js';
import { CrystalSeason } from '../../../features/crystal-ball/components/CrystalSeason.js';
import { crystalSelectionStatus } from '../../../features/crystal-ball/hooks/crystal-selection-status.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import './crystal-ball.css';
import '../leagues/leagues.css';

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
      {!crystalSelectionStatus(competition) && competition.season && competition.division ? (
        <CrystalSeason
          key={`${competition.division.id}/${userId}`}
          divisionId={competition.division.id}
          season={competition.season.name}
          userId={userId}
        />
      ) : (
        <output>
          {crystalSelectionStatus(competition)}
          <button type="button" onClick={competition.retry}>
            Reintentar
          </button>
        </output>
      )}
      {(!competition.season || !competition.division) && <CrystalRules />}
    </PageLayout>
  );
}
