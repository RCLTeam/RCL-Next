import React from 'react';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { PlayerLeaderboards } from './PlayerLeaderboards.js';
import { PlayerMvpPoll } from './PlayerMvpPoll.js';
import { PlayerProfilePreview } from './PlayerProfilePreview.js';
import './players.css';
import './ranking-panel.css';

export function PlayersPage() {
  return (
    <PageLayout
      id="jugadores"
      number="06"
      title="Jugadores"
      subtitle="Protagonistas de la rebelión"
      description="Perfiles, plantillas y estadísticas de quienes construyen el legado de RCL."
      toolbar={
        <>
          <span className="meta">Comunidad RCL</span>
          <span className="availability">Próximamente</span>
        </>
      }
    >
      <PlayerProfilePreview />
      <PlayerLeaderboards />
      <PlayerMvpPoll />
    </PageLayout>
  );
}
