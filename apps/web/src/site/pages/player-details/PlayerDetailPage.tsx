import React, { useEffect } from 'react';
import { TeamBadge } from '../../../features/competition/components/TeamBadge.js';
import { useCompetitionDetail } from '../../../features/competition/hooks/useCompetitionDetail.js';
import type {
  PlayerDetail,
  TeamMember
} from '../../../features/competition/types/competition.types.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import './player-details.css';

const roleLabels: Record<TeamMember['role'], string> = {
  top: 'Top',
  jungle: 'Jungla',
  mid: 'Mid',
  adc: 'ADC',
  support: 'Support',
  substitute: 'Suplente',
  coach: 'Coach',
  staff: 'Staff',
  partners: 'Partner'
};

export function PlayerProfile({ player }: { player: PlayerDetail }) {
  const riotId = `${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''}`;
  return (
    <>
      <header className="player-profile-header">
        <span className="player-monogram" aria-hidden="true">
          {player.gameName.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <span className="eyebrow">
            {player.isMain ? 'Cuenta principal' : 'Cuenta registrada'}
          </span>
          <h2>{riotId}</h2>
          <p>{player.displayName ?? 'Jugador RCL'}</p>
        </div>
      </header>
      <dl className="player-profile-info">
        <div>
          <dt>Nombre en el juego</dt>
          <dd>{player.gameName}</dd>
        </div>
        <div>
          <dt>Riot Tag</dt>
          <dd>{player.riotTag ? `#${player.riotTag}` : 'No disponible'}</dd>
        </div>
        <div>
          <dt>País</dt>
          <dd>{player.countryCode?.toUpperCase() ?? 'No disponible'}</dd>
        </div>
        <div>
          <dt>Comunidad</dt>
          <dd>{player.displayName ?? 'Sin cuenta vinculada'}</dd>
        </div>
      </dl>
      <section className="player-teams" aria-label="Equipos e inscripciones">
        <h2>Equipos e inscripciones</h2>
        <p className="meta">Participación por temporada y división</p>
        {player.teams.length ? (
          <div className="player-grid">
            {player.teams.map((team) => (
              <SiteLink
                className="player-card player-team-card"
                key={team.id}
                href={`/equipos/${encodeURIComponent(team.slug ?? team.id)}`}
              >
                <TeamBadge team={team} />
                <h3>{team.name}</h3>
                <p>
                  {team.seasonName} · {team.divisionName}
                </p>
                <span className="player-card-action">
                  {roleLabels[team.role]}
                  {team.isCaptain ? ' · Capitán' : ''}
                </span>
                {!team.isActive && <p className="meta">Equipo inactivo</p>}
                <span className="player-card-action">Ver equipo →</span>
              </SiteLink>
            ))}
          </div>
        ) : (
          <div className="empty-state">Este jugador todavía no tiene inscripciones en equipos.</div>
        )}
      </section>
    </>
  );
}

export function PlayerDetailPage({ playerId }: { playerId: string }) {
  const { state, retry } = useCompetitionDetail('players', playerId);
  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.data.gameName} · Rebel Crown Legacy`;
  }, [state]);
  return (
    <PageLayout
      id="jugador"
      number="06"
      title={state.status === 'ready' ? state.data.gameName : 'Ficha del jugador'}
      subtitle="Protagonistas de la rebelión"
      description="Conoce al jugador y sus inscripciones en la competición."
      toolbar={
        <SiteLink className="player-back-link" href="/jugadores">
          ← Volver a jugadores
        </SiteLink>
      }
    >
      {state.status === 'loading' && <output className="empty-state">Cargando jugador…</output>}
      {state.status === 'missing' && (
        <div className="empty-state">Jugador no encontrado. Puede que ya no esté disponible.</div>
      )}
      {state.status === 'error' && (
        <div className="empty-state error-state" role="alert">
          <p>No se ha podido cargar el jugador.</p>
          <button className="btn-ghost" type="button" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}
      {state.status === 'ready' && <PlayerProfile player={state.data} />}
    </PageLayout>
  );
}
