import { type PlayerTeam, isCompetitiveRole, isNonCompetitiveRole } from '@rcl/contracts';
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

function PlayerMembershipSection({
  id,
  title,
  teams,
  empty
}: {
  id: string;
  title: string;
  teams: PlayerTeam[];
  empty: string;
}) {
  return (
    <section className="player-teams" aria-labelledby={id}>
      <div className="player-detail-section-heading">
        <h2 id={id}>{title}</h2>
        <span className="meta">
          {teams.length} {teams.length === 1 ? 'vinculacion' : 'vinculaciones'}
        </span>
      </div>
      {teams.length ? (
        <div className="player-profile-team-grid">
          {teams.map((team) => (
            <SiteLink
              className="player-profile-membership player-affiliation-card"
              key={team.id}
              href={`/equipos/${encodeURIComponent(team.slug ?? team.id)}`}
            >
              <div className="player-affiliation-body">
                <span className="player-affiliation-context">
                  {team.seasonName} · {team.divisionName}
                </span>
                <h3 title={team.name}>{team.name}</h3>
                <span className="player-affiliation-role">
                  {roleLabels[team.role]}
                  {team.isCaptain ? ' · Capitan' : ''}
                </span>
              </div>
              <TeamBadge team={team} />
            </SiteLink>
          ))}
        </div>
      ) : (
        <div className="empty-state">{empty}</div>
      )}
    </section>
  );
}

export function PlayerProfile({ player }: { player: PlayerDetail }) {
  const tag = player.riotTag?.replace(/^#/, '').trim();
  const riotId = `${player.gameName}${tag ? `#${tag}` : ''}`;
  const registrationTeam = player.registrationTeam ?? null;
  const competitiveTeams = player.teams.filter((team) => isCompetitiveRole(team.role));
  const otherTeams = player.teams.filter((team) => isNonCompetitiveRole(team.role));
  const stats = player.competition?.stats;
  const mvpCount = player.competition?.mvpMatchIds.length;
  const format = (value: number | null | undefined, suffix = '') =>
    value == null ? '—' : `${value.toLocaleString('es', { maximumFractionDigits: 2 })}${suffix}`;
  const metrics = [
    ['Partidas', format(stats?.games)],
    ['KDA', format(stats?.kda)],
    ['Victorias', format(stats?.winRate, '%')],
    ['MVPs', mvpCount === undefined ? '—' : String(mvpCount)],
    ['CS / min', format(stats?.csPerMinute)],
    ['Participacion en kills', format(stats?.killParticipation, '%')],
    ['Daño / min', format(stats?.damagePerMinute)],
    ['Vision', format(stats?.visionScore)]
  ];
  return (
    <div
      className="player-detail-profile"
      style={
        { '--profile-color': registrationTeam?.color || 'var(--purple)' } as React.CSSProperties
      }
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
            {registrationTeam && <span>{roleLabels[registrationTeam.role]}</span>}
            {!registrationTeam && <span>Sin equipo competitivo</span>}
            {registrationTeam?.isCaptain && <span className="player-captain-label">Capitan</span>}
            {player.countryCode && <span>{player.countryCode.toUpperCase()}</span>}
          </div>
        </div>
        {registrationTeam ? (
          <SiteLink
            className="player-profile-team"
            href={`/equipos/${encodeURIComponent(registrationTeam.slug ?? registrationTeam.id)}`}
          >
            <span className="meta">Equipo competitivo</span>
            <TeamBadge team={registrationTeam} />
            <strong>{registrationTeam.name}</strong>
            <span className="meta">
              {registrationTeam.seasonName} · {registrationTeam.divisionName}
            </span>
            {!registrationTeam.isActive && <span className="meta">Equipo inactivo</span>}
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
            <dt>Pais</dt>
            <dd>{player.countryCode.toUpperCase()}</dd>
          </div>
        )}
        <div>
          <dt>Comunidad</dt>
          <dd>{displayName(player.displayName ?? 'Sin cuenta vinculada')}</dd>
        </div>
        <div>
          <dt>Inscripciones competitivas</dt>
          <dd>{competitiveTeams.length}</dd>
        </div>
        <div>
          <dt>Otras vinculaciones</dt>
          <dd>{otherTeams.length}</dd>
        </div>
      </dl>
      <section className="player-linked-accounts" aria-labelledby="player-accounts-title">
        <div className="player-detail-section-heading">
          <h2 id="player-accounts-title">Cuentas secundarias</h2>
          <span className="meta">Cuentas del mismo jugador</span>
        </div>
        {player.linkedAccounts?.length ? (
          <div className="player-profile-team-grid">
            {player.linkedAccounts.map((account) => {
              const accountTag = account.riotTag?.replace(/^#/, '').trim();
              return (
                <div className="player-profile-membership player-linked-account" key={account.id}>
                  <SiteLink
                    className="player-linked-account-profile"
                    href={`/jugadores/${encodeURIComponent(account.slug ?? account.id)}`}
                  >
                    <span className="meta">
                      {account.isMain ? 'Cuenta principal' : 'Cuenta secundaria'}
                    </span>
                    <h3>{account.gameName}</h3>
                    <p>
                      {account.gameName}
                      {accountTag ? `#${accountTag}` : ''}
                    </p>
                  </SiteLink>
                  {accountTag && (
                    <a
                      className="player-profile-opgg"
                      href={`https://op.gg/es/lol/summoners/euw/${encodeURIComponent(account.gameName)}-${encodeURIComponent(accountTag)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Ver OP.GG de ${account.gameName} (nueva pestaña)`}
                    >
                      <img src="/images/brand/opgg.webp" alt="OP.GG" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">No hay otras cuentas vinculadas a este jugador.</div>
        )}
      </section>
      <section className="player-performance" aria-labelledby="player-performance-title">
        <div className="player-detail-section-heading">
          <h2 id="player-performance-title">Rendimiento</h2>
          {player.statisticsSeasonName && (
            <span className="meta">{player.statisticsSeasonName}</span>
          )}
        </div>
        {stats?.games || (mvpCount ?? 0) > 0 ? (
          <>
            {!stats?.games && (
              <p className="meta">
                Estadisticas de partidas no disponibles. Se conservan los MVPs registrados.
              </p>
            )}
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
                <span className="meta">Campeon mas jugado</span>
                <strong>{player.competition.champion}</strong>
              </p>
            )}
          </>
        ) : (
          <div className="player-performance-empty">
            <h3>Sin partidas registradas</h3>
            <p>
              {player.statisticsSeasonName
                ? 'Las estadisticas apareceran cuando haya partidas registradas en esta temporada.'
                : 'No hay partidas ni premios registrados para este jugador.'}
            </p>
          </div>
        )}
      </section>
      <PlayerMembershipSection
        id="player-memberships-title"
        title="Equipos y vinculaciones"
        teams={player.teams}
        empty="Este jugador todavia no tiene inscripciones en equipos."
      />
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
      subtitle="Protagonistas de la rebelion"
      description="Conoce al jugador y sus inscripciones en la competicion."
    >
      {state.status === 'loading' && <output className="empty-state">Cargando jugador…</output>}
      {state.status === 'missing' && (
        <div className="empty-state">Jugador no encontrado. Puede que ya no este disponible.</div>
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
