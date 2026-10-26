import React from 'react';
import { useAuth } from '../../../features/auth/components/AuthProvider.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { CrystalSeason } from '../../../features/crystal-ball/CrystalSeason.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { Select } from '../../../shared/components/Selector/Selector.js';
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
        <Select
          label="Temporada"
          value={competition.season?.id ?? ''}
          onChange={(e) => competition.selectSeason(e.target.value)}
        >
          <option value="" disabled>
            Seleccionar temporada
          </option>
          {competition.seasons.data.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <span className="crystal-toolbar-note">Playoffs · Premier & Ascend</span>
      </div>
      {competition.season ? (
        <CrystalSeason
          key={`${competition.season.name}/${userId}`}
          season={competition.season.name}
          userId={userId}
        />
      ) : (
        <output>
          {competition.seasons.status === 'error'
            ? 'No se pudieron cargar las temporadas.'
            : 'Selecciona una temporada para ver sus predicciones.'}
          <button type="button" onClick={competition.retry}>
            Reintentar
          </button>
        </output>
      )}
    </PageLayout>
  );
}
