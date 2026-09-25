import React, { useEffect } from 'react';
import { useCompetitionDetail } from '../../../features/competition/hooks/useCompetitionDetail.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { useGameCatalog } from '../../../shared/riot/useGameCatalog.js';
import { MatchReport } from './MatchReport.js';
import './match-detail.css';

export function MatchDetailPage({ matchId }: { matchId: string }) {
  const { state, retry } = useCompetitionDetail('matches', matchId);
  const catalog = useGameCatalog();
  useEffect(() => {
    if (state.status === 'ready')
      document.title = `${state.data.homeTeam.name} vs ${state.data.awayTeam.name} · Rebel Crown Legacy`;
  }, [state]);
  return (
    <PageLayout
      id="partido"
      number="03"
      title="Ficha del partido"
      subtitle="Cada mapa cuenta"
      description="El resultado y todos los detalles de la serie."
      toolbar={
        <SiteLink className="text-link" href="/calendario">
          ← Volver al calendario
        </SiteLink>
      }
    >
      {state.status === 'loading' && <output className="empty-state">Cargando partido…</output>}
      {state.status === 'missing' && (
        <div className="empty-state">
          Partido no disponible. La ficha se publica al terminar el encuentro.
        </div>
      )}
      {state.status === 'error' && (
        <div className="empty-state error-state" role="alert">
          <p>No se pudo cargar el partido.</p>
          <button className="btn-ghost" type="button" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <MatchReport key={state.data.id} match={state.data} catalog={catalog} />
      )}
    </PageLayout>
  );
}
