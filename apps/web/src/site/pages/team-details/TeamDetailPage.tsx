import type React from 'react';
import { useEffect } from 'react';
import { TeamBadge } from '../../../features/competition/components/TeamBadge.js';
import { useCompetitionDetail } from '../../../features/competition/hooks/useCompetitionDetail.js';
import type {
  TeamDetail,
  TeamMember
} from '../../../features/competition/types/competition.types.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import './team-details.css';

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
const playerRoles: TeamMember['role'][] = ['top', 'jungle', 'mid', 'adc', 'support', 'substitute'];

function MemberSection({
  title,
  members,
  empty,
  team
}: { title: string; members: TeamMember[]; empty: string; team?: TeamDetail }) {
  return (
    <section className="team-roster-section" aria-label={title}>
      <div className="team-section-heading">
        <h2>{title}</h2>
        <span className="meta">{members.length} integrantes</span>
      </div>
      {members.length ? (
        <div className="team-member-grid">
          {members.map((member) => (
            <article
              className={`team-member-card ${team ? 'team-player-card' : 'team-support-card'}${member.isCaptain ? ' is-captain' : ''}`}
              style={
                team
                  ? ({ '--team-color': team.color || 'var(--purple)' } as React.CSSProperties)
                  : undefined
              }
              key={member.id}
            >
              {team && playerRoles.includes(member.role) && (
                <div className="team-player-overview">
                  <dl className="team-player-stats">
                    <div>
                      <dt>Partidas jugadas</dt>
                      <dd>{member.rosterStats?.games ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>MVPs</dt>
                      <dd>{member.rosterStats?.mvps ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Campeones jugados</dt>
                      <dd>{member.rosterStats?.champions ?? '—'}</dd>
                    </div>
                  </dl>
                  <div className="team-player-emblem">
                    <TeamBadge team={team} />
                  </div>
                  {member.isCaptain && (
                    <span className="team-tag team-player-captain">Capitán</span>
                  )}
                </div>
              )}
              <div className="team-member-role">
                <span className="meta">{roleLabels[member.role]}</span>
                {team && member.countryCode && (
                  <span className="meta">{member.countryCode.toUpperCase()}</span>
                )}
              </div>
              <div className="team-member-identity">
                {(!team || !playerRoles.includes(member.role)) && member.isCaptain && (
                  <span className="team-tag">Capitán</span>
                )}
                <h3>
                  {member.playerId ? (
                    <SiteLink
                      className="team-member-profile-link"
                      href={`/jugadores/${encodeURIComponent(member.playerSlug ?? member.playerId)}`}
                    >
                      {member.name}
                    </SiteLink>
                  ) : (
                    member.name
                  )}
                </h3>
                {team && (
                  <p>
                    {member.gameName
                      ? `${member.gameName}${member.riotTag ? `#${member.riotTag.replace(/^#/, '')}` : ''}`
                      : 'Cuenta de juego no disponible'}
                  </p>
                )}
                {team && member.gameName && member.riotTag?.replace(/^#/, '').trim() && (
                  <a
                    className="team-member-opgg"
                    href={`https://op.gg/es/lol/summoners/euw/${encodeURIComponent(member.gameName)}-${encodeURIComponent(member.riotTag.replace(/^#/, '').trim())}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Ver OP.GG de ${member.gameName} (nueva pestaña)`}
                  >
                    <img src="/images/brand/opgg.webp" alt="OP.GG" />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">{empty}</div>
      )}
    </section>
  );
}

export function TeamProfile({ team }: { team: TeamDetail }) {
  const players = team.members
    .filter((member) => playerRoles.includes(member.role))
    .sort(
      (a, b) =>
        playerRoles.indexOf(a.role) - playerRoles.indexOf(b.role) ||
        a.name.localeCompare(b.name, 'es')
    );
  return (
    <>
      <header
        className="team-profile-header"
        style={{ '--team-color': team.color || 'var(--panel)' } as React.CSSProperties}
      >
        <TeamBadge team={team} />
        <div>
          <span className="eyebrow">{team.divisionName}</span>
          <h2>{team.shortName ?? team.name}</h2>
          <p>{team.seasonName}</p>
        </div>
        <span className="team-profile-status">
          {team.isActive ? 'Equipo activo' : 'Equipo inactivo'}
        </span>
      </header>
      <dl className="team-profile-info">
        <div>
          <dt>Equipo</dt>
          <dd>{team.name}</dd>
        </div>
        <div>
          <dt>División</dt>
          <dd>{team.divisionName}</dd>
        </div>
        <div>
          <dt>Temporada</dt>
          <dd>{team.seasonName}</dd>
        </div>
        <div>
          <dt>Jugadores</dt>
          <dd>{players.length}</dd>
        </div>
      </dl>
      <MemberSection
        title="Jugadores"
        team={team}
        members={players}
        empty="Todavía no hay jugadores inscritos en este equipo."
      />
      <MemberSection
        title="Coach"
        team={team}
        members={team.members.filter((member) => member.role === 'coach')}
        empty="Coach pendiente de anunciar."
      />
      <MemberSection
        title="Staff"
        team={team}
        members={team.members.filter((member) => member.role === 'staff')}
        empty="Todavía no hay staff registrado."
      />
      {team.members.some((member) => member.role === 'partners') && (
        <MemberSection
          title="Partners"
          members={team.members.filter((member) => member.role === 'partners')}
          empty=""
        />
      )}
    </>
  );
}

export function TeamDetailPage({ teamId }: { teamId: string }) {
  const { state, retry } = useCompetitionDetail('teams', teamId);
  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.data.name} · Rebel Crown Legacy`;
  }, [state]);
  return (
    <PageLayout
      id="equipo"
      number="05"
      title={state.status === 'ready' ? state.data.name : 'Ficha del equipo'}
      subtitle="Una identidad. Una rebelión."
      description="Conoce a los jugadores y al equipo que hay detrás de la competición."
      toolbar={
        <SiteLink className="team-back-link" href="/equipos">
          ← Volver a equipos
        </SiteLink>
      }
    >
      {state.status === 'loading' && <output className="empty-state">Cargando equipo…</output>}
      {state.status === 'missing' && (
        <div className="empty-state">Equipo no encontrado. Puede que ya no esté disponible.</div>
      )}
      {state.status === 'error' && (
        <div className="empty-state" role="alert">
          <p>No se ha podido cargar el equipo.</p>
          <button type="button" onClick={retry}>
            Reintentar
          </button>
        </div>
      )}
      {state.status === 'ready' && <TeamProfile team={state.data} />}
    </PageLayout>
  );
}
