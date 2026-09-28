import type React from 'react';
import { useEffect } from 'react';
import { TeamBadge } from '../../../features/competition/components/TeamBadge.js';
import { useCompetitionDetail } from '../../../features/competition/hooks/useCompetitionDetail.js';
import type {
  PlayerDetail,
  TeamMember
} from '../../../features/competition/types/competition.types.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { displayName } from '../../../shared/display-name.js';
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
  const tag = player.riotTag?.replace(/^#/, '').trim();
  const riotId = `${player.gameName}${tag ? `#${tag}` : ''}`;
  const latestTeam = player.teams[0];
  const stats = player.competition?.stats;
  const format = (value: number | null | undefined, suffix = '') =>
    value == null ? '—' : `${value.toLocaleString('es', { maximumFractionDigits: 2 })}${suffix}`;
  const metrics = [
    ['Partidas', format(stats?.games)],
    ['KDA', format(stats?.kda)],
    ['Victorias', format(stats?.winRate, '%')],
    ['MVPs', stats ? String(player.competition?.mvpMatchIds.length ?? 0) : '—'],
    ['CS / min', format(stats?.csPerMinute)],
    ['Participación en kills', format(stats?.killParticipation, '%')],
    ['Daño / min', format(stats?.damagePerMinute)],
    ['Visión', format(stats?.visionScore)]
  ];
  return (
    <div
      className="player-detail-profile"
      style={{ '--profile-color': latestTeam?.color || 'var(--purple)' } as React.CSSProperties}
    >
      <header className="player-profile-header">
        <div className="player-profile-identity">
          <span className="eyebrow">
            {player.isMain ? 'Cuenta principal' : 'Cuenta registrada'}
          </span>
          <h2>{player.gameName}</h2>
          <div className="player-profile-account">
            <div className="player-profile-account-names">
              <p className="player-profile-riot">{riotId}</p>
              <p>{displayName(player.displayName ?? 'Jugador RCL')}</p>
            </div>
            {tag && (
              <a
                className="player-profile-opgg"
                href={`https://op.gg/es/lol/summoners/euw/${encodeURIComponent(player.gameName)}-${encodeURIComponent(tag)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ver OP.GG de ${player.gameName} (nueva pestaña)`}
              >
                <img src="/images/brand/opgg.webp" alt="OP.GG" />
              </a>
            )}
          </div>
          <div className="player-profile-labels">
            {latestTeam && <span>{roleLabels[latestTeam.role]}</span>}
            {latestTeam?.isCaptain && <span className="player-captain-label">Capitán</span>}
            {player.countryCode && <span>{player.countryCode.toUpperCase()}</span>}
          </div>
        </div>
        {latestTeam ? (
          <SiteLink
            className="player-profile-team"
            href={`/equipos/${encodeURIComponent(latestTeam.slug ?? latestTeam.id)}`}
          >
            <span className="meta">Inscripción más reciente</span>
            <TeamBadge team={latestTeam} />
            <strong>{latestTeam.name}</strong>
            <span className="meta">
              {latestTeam.seasonName} · {latestTeam.divisionName}
            </span>
          </SiteLink>
        ) : (
          <span className="player-profile-initials" aria-hidden="true">
            {player.gameName.slice(0, 2).toUpperCase()}
          </span>
        )}
      </header>
      <dl className="player-profile-info">
        <div>
          <dt>Riot ID</dt>
          <dd>{riotId}</dd>
        </div>
        {player.countryCode && (
          <div>
            <dt>País</dt>
            <dd>{player.countryCode.toUpperCase()}</dd>
          </div>
        )}
        <div>
          <dt>Comunidad</dt>
          <dd>{displayName(player.displayName ?? 'Sin cuenta vinculada')}</dd>
        </div>
        <div>
          <dt>Inscripciones</dt>
          <dd>{player.teams.length}</dd>
        </div>
      </dl>
      <section className="player-performance" aria-labelledby="player-performance-title">
        <div className="player-detail-section-heading">
          <h2 id="player-performance-title">Rendimiento</h2>
          {latestTeam && (
            <span className="meta">
              {latestTeam.seasonName} · {latestTeam.divisionName}
            </span>
          )}
        </div>
        {stats?.games ? (
          <>
            <dl className="player-performance-grid">
              {metrics.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {player.competition?.champion && (
              <p className="player-signature-champion">
                <span className="meta">Campeón más jugado</span>
                <strong>{player.competition.champion}</strong>
              </p>
            )}
          </>
        ) : (
          <div className="player-performance-empty">
            <span className="eyebrow">La historia está por escribir</span>
            <h3>Próxima parada: la Grieta.</h3>
            <p>Las estadísticas aparecerán cuando haya partidas registradas en esta competición.</p>
          </div>
        )}
      </section>
      <section className="player-teams" aria-label="Equipos e inscripciones">
        <div className="player-detail-section-heading">
          <h2>Equipos e inscripciones</h2>
          <span className="meta">Por temporada y división</span>
        </div>
        {player.teams.length ? (
          <div className="player-profile-team-grid">
            {player.teams.map((team) => (
              <SiteLink
                className="player-profile-membership"
                key={team.id}
                href={`/equipos/${encodeURIComponent(team.slug ?? team.id)}`}
              >
                <TeamBadge team={team} />
                <div>
                  <span className="meta">
                    {team.seasonName} · {team.divisionName}
                  </span>
                  <h3>{team.name}</h3>
                  <p>
                    {roleLabels[team.role]}
                    {team.isCaptain ? ' · Capitán' : ''}
                  </p>
                  {!team.isActive && <span className="meta">Equipo inactivo</span>}
                </div>
              </SiteLink>
            ))}
          </div>
        ) : (
          <div className="empty-state">Este jugador todavía no tiene inscripciones en equipos.</div>
        )}
      </section>
    </div>
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
