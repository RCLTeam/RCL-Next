import { COMPETITIVE_ROLES, isCompetitiveRole } from '@rcl/contracts';
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
import { displayName } from '../../../shared/display-name.js';
import { ChampionArt } from '../../../shared/riot/ChampionArt.js';
import { getGameAsset } from '../../../shared/riot/riot-assets.service.js';
import { useGameCatalog } from '../../../shared/riot/useGameCatalog.js';
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
const playerRoles: readonly TeamMember['role'][] = COMPETITIVE_ROLES;

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
              className={`team-member-card ${team && isCompetitiveRole(member.role) ? 'team-player-card' : 'team-support-card'}${member.isCaptain ? ' is-captain' : ''}`}
              style={
                team
                  ? ({ '--team-color': team.color || 'var(--purple)' } as React.CSSProperties)
                  : undefined
              }
              key={member.id}
            >
              <div className="team-member-role">
                <span className="meta">{roleLabels[member.role]}</span>
                {member.isCaptain && <span className="team-tag">Capitan</span>}
                {team && member.countryCode && (
                  <span className="meta">{member.countryCode.toUpperCase()}</span>
                )}
              </div>
              <div className="team-member-identity">
                {team && (
                  <div className="team-player-emblem">
                    <TeamBadge team={team} />
                  </div>
                )}
                <h3>
                  {member.playerId ? (
                    <SiteLink
                      className="team-member-profile-link"
                      href={`/jugadores/${encodeURIComponent(member.playerSlug ?? member.playerId)}`}
                    >
                      {displayName(member.gameName ?? member.name)}
                    </SiteLink>
                  ) : (
                    displayName(member.gameName ?? member.name)
                  )}
                </h3>
                {team &&
                  member.gameName &&
                  displayName(member.gameName) !== displayName(member.name) && (
                    <p>{displayName(member.name)}</p>
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
              {team && isCompetitiveRole(member.role) && (
                <div className="team-player-overview">
                  <dl className="team-player-stats">
                    <div>
                      <dt>Partidas</dt>
                      <dd>{member.rosterStats?.games ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>MVPs</dt>
                      <dd>{member.rosterStats?.mvps ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Campeones</dt>
                      <dd>{member.rosterStats?.champions ?? '—'}</dd>
                    </div>
                  </dl>
                </div>
              )}
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
  const catalog = useGameCatalog();
  const players = team.members
    .filter((member) => isCompetitiveRole(member.role))
    .sort(
      (a, b) =>
        playerRoles.indexOf(a.role) - playerRoles.indexOf(b.role) ||
        a.name.localeCompare(b.name, 'es')
    );
  const summoners = players.flatMap((player) => {
    const gameName = player.gameName?.trim();
    const tag = player.riotTag?.trim().replace(/^#/, '').trim();
    return gameName && tag ? [`${gameName}#${tag}`] : [];
  });
  const multiOpggUrl = summoners.length
    ? `https://op.gg/es/lol/multisearch/euw?${new URLSearchParams({ summoners: [...new Set(summoners)].join(',') })}`
    : null;

  return (
    <>
      <header
        className="team-profile-header"
        style={{ '--team-color': team.color || 'var(--purple)' } as React.CSSProperties}
      >
        <div className="team-profile-champions" aria-label="Campeones mas jugados de los titulares">
          {playerRoles
            .filter((role) => role !== 'substitute')
            .map((role) => {
              const member = (team.featuredLineup ?? players).find(
                (player) => player.role === role
              );
              const champion = getGameAsset('champion', member?.champion ?? null, catalog);
              return (
                <div className="team-profile-champion" key={role}>
                  <div className="team-profile-champion-art">
                    {champion?.splashImage && (
                      <ChampionArt asset={champion} variant="centered" alt="" />
                    )}
                  </div>
                  <div className="team-profile-champion-label">
                    <span>{roleLabels[role]}</span>
                    <strong
                      title={member ? (member.gameName ?? displayName(member.name)) : 'Sin titular'}
                    >
                      {member ? (member.gameName ?? displayName(member.name)) : 'Sin titular'}
                    </strong>
                    {member && <small>{champion?.name ?? member.champion ?? 'Sin partidas'}</small>}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="team-profile-identity">
          <span className="eyebrow">{team.divisionName}</span>
          <h2>{team.shortName ?? team.name}</h2>
          <p>{team.name}</p>
          <dl className="team-profile-info">
            <div>
              <dt>Temporada</dt>
              <dd>{team.seasonName}</dd>
            </div>
            <div>
              <dt>Jugadores</dt>
              <dd>{players.length}</dd>
            </div>
          </dl>
        </div>
        <div className="team-profile-actions">
          <TeamBadge team={team} />
          <span className="team-profile-status">
            {team.isActive ? 'Equipo activo' : 'Equipo inactivo'}
          </span>
          {multiOpggUrl && (
            <a
              className="team-profile-opgg"
              href={multiOpggUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver Multi OP.GG de ${team.name} (nueva pestaña)`}
              title="Multi OP.GG"
            >
              <img src="/images/brand/opgg.webp" alt="OP.GG" />
            </a>
          )}
        </div>
      </header>
      <MemberSection
        title="Jugadores"
        team={team}
        members={players}
        empty="Todavia no hay jugadores inscritos en este equipo."
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
        empty="Todavia no hay staff registrado."
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
      subtitle="Una identidad. Una rebelion."
      description="Conoce a los jugadores y al equipo que hay detras de la competicion."
    >
      {state.status === 'loading' && <output className="empty-state">Cargando equipo…</output>}
      {state.status === 'missing' && (
        <div className="empty-state">Equipo no encontrado. Puede que ya no este disponible.</div>
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
