import type { Player, PlayerStatistics } from '@rcl/contracts';
import React, { useState } from 'react';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import { TeamBadge } from '../../../features/competition/components/TeamBadge.js';
import { useCollection } from '../../../features/competition/hooks/useCollection.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { Select } from '../../../shared/components/Selector/Selector.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { resolveTeamLogo } from '../../../shared/resources/team-logos.js';
import { type GameCatalog, getGameAsset } from '../../../shared/riot/riot-assets.service.js';
import { useGameCatalog } from '../../../shared/riot/useGameCatalog.js';
import './players.css';

export const playerSortOptions = [
  ['kda', 'KDA'],
  ['csPerMinute', 'CS/min'],
  ['killParticipation', 'Kill participation'],
  ['winRate', '% de victorias'],
  ['damagePerMinute', 'Daño a campeones/min'],
  ['visionScore', 'Puntuación de visión'],
  ['damageMitigated', 'Daño mitigado']
] as const;
export type PlayerSort = (typeof playerSortOptions)[number][0];
const playerCardStats: Record<PlayerSort, { label: string; description: string }> = {
  kda: { label: 'KDA', description: 'Relación entre asesinatos, asistencias y muertes.' },
  csPerMinute: { label: 'CS/min', description: 'Súbditos y monstruos eliminados por minuto.' },
  killParticipation: {
    label: 'KP',
    description: 'Porcentaje de asesinatos del equipo en los que participa el jugador.'
  },
  winRate: { label: 'WR', description: 'Porcentaje de victorias.' },
  damagePerMinute: { label: 'Daño/min', description: 'Daño a campeones por minuto.' },
  visionScore: { label: 'Visión', description: 'Puntuación de visión.' },
  damageMitigated: { label: 'Mitigado', description: 'Daño mitigado.' }
};
const roles = [
  ['all', 'Todos'],
  ['top', 'Top'],
  ['jungle', 'Jungla'],
  ['mid', 'Mid'],
  ['adc', 'ADC'],
  ['support', 'Support'],
  ['substitute', 'Suplente']
] as const;
const roleLabel = (role: string | null | undefined) =>
  roles.find(([key]) => key === role)?.[1] ?? 'Sin posición';
const playerHref = (player: Player) => `/jugadores/${encodeURIComponent(player.slug ?? player.id)}`;

export function formatPlayerStat(stats: PlayerStatistics | null | undefined, key: PlayerSort) {
  const value = stats?.[key];
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString('es', { maximumFractionDigits: key === 'kda' || key === 'csPerMinute' ? 2 : 1 })}${key === 'winRate' || key === 'killParticipation' ? '%' : ''}`;
}

export function PlayersPage({ competition }: { competition: Competition }) {
  const sortId = React.useId();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [sort, setSort] = useState<PlayerSort>('kda');
  const [revision, setRevision] = useState(0);
  const players = useCollection<Player>(
    competition.division
      ? `divisions/${encodeURIComponent(competition.division.id)}/players`
      : null,
    revision
  );
  const catalog = useGameCatalog();
  const filtered = filterPlayers(players.data, query, role, sort);
  return (
    <PageLayout
      id="jugadores"
      number="06"
      title="Jugadores"
      subtitle="Protagonistas de la rebelión"
      description="El MVP de la jornada y todos los protagonistas de RCL, con sus estadísticas de temporada."
      toolbar={<CompetitionFilters competition={competition} />}
    >
      <DataState
        state={resolveCompetitionState(competition, players)}
        loadingMessage="Cargando jugadores…"
        errorMessage="No se han podido cargar los jugadores."
        empty="Todavía no hay jugadores registrados en esta temporada y división."
        retry={() => {
          competition.retry();
          setRevision((value) => value + 1);
        }}
      >
        <FeaturedPlayer
          player={players.data.find((player) => player.competition?.featured)}
          catalog={catalog}
        />
        <section className="players-directory" aria-labelledby="all-players-title">
          <div className="players-heading">
            <h2 id="all-players-title" className="eyebrow">
              Todos los jugadores
            </h2>
            <span className="meta">{filtered.length} jugadores</span>
          </div>
          <div className="players-controls">
            <fieldset className="players-roles" aria-label="Filtrar por posición">
              {roles.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={role === value}
                  onClick={() => setRole(value)}
                >
                  {label}
                </button>
              ))}
            </fieldset>
            <label className="select-field">
              Buscar jugador
              <input
                type="search"
                placeholder="Nombre o Riot ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <Select
              label="Ordenar por"
              id={sortId}
              value={sort}
              onChange={(event) => setSort(event.target.value as PlayerSort)}
            >
              {playerSortOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <PlayerGrid players={filtered} sort={sort} catalog={catalog} />
        </section>
      </DataState>
    </PageLayout>
  );
}

const VALID_PLAYER_ROLES = ['top', 'jungle', 'mid', 'adc', 'support', 'substitute'];
export function filterPlayers(
  players: Player[],
  query: string,
  role = 'all',
  sort: PlayerSort = 'kda'
) {
  const search = query.trim().toLocaleLowerCase('es');
  return players
    .filter((player) => {
      const playerRole = player.competition?.role;
      const hasStats = Boolean(player.competition?.stats);

      let matchesRole = false;
      if (role === 'all') {
        matchesRole = VALID_PLAYER_ROLES.includes(playerRole ?? '') || hasStats;
      } else {
        matchesRole = playerRole === role;
      }

      const matchesQuery =
        `${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''} ${player.displayName ?? ''}`
          .toLocaleLowerCase('es')
          .includes(search);

      return matchesRole && matchesQuery;
    })
    .sort((a, b) => {
      const left = a.competition?.stats?.[sort];
      const right = b.competition?.stats?.[sort];
      if (left == null && right != null) return 1;
      if (right == null && left != null) return -1;
      if (left == null && right == null) {
        const leftTeam = a.competition?.team;
        const rightTeam = b.competition?.team;
        if (!leftTeam && rightTeam) return 1;
        if (!rightTeam && leftTeam) return -1;

        return (
          (leftTeam?.name ?? '').localeCompare(rightTeam?.name ?? '', 'es') ||
          (leftTeam?.id ?? '').localeCompare(rightTeam?.id ?? '') ||
          a.gameName.localeCompare(b.gameName, 'es') ||
          a.id.localeCompare(b.id)
        );
      }
      const numLeft = left ?? 0;
      const numRight = right ?? 0;
      return (
        numRight - numLeft || a.gameName.localeCompare(b.gameName, 'es') || a.id.localeCompare(b.id)
      );
    });
}

function PlayerArt({ player, catalog }: { player: Player; catalog: GameCatalog }) {
  const champion = getGameAsset('champion', player.competition?.champion ?? null, catalog);
  const noChampion = !player.competition?.champion;
  const teamLogo = resolveTeamLogo(player.competition?.team?.logoUrl);
  return (
    <div
      className={`player-art${noChampion ? ' player-art-unplayed' : ''}`}
      style={
        {
          '--player-team-color': player.competition?.team?.color || 'var(--purple)'
        } as React.CSSProperties
      }
    >
      <span className="player-art-fallback" aria-hidden="true">
        {player.gameName.slice(0, 2).toUpperCase()}
      </span>
      {noChampion && (
        <>
          {teamLogo && (
            <span className="player-unplayed-team">
              <TeamBadge team={player.competition?.team} />
            </span>
          )}
          <span className="player-unplayed-label">Sin campeón registrado</span>
        </>
      )}
      {champion?.splashImage && (
        <img
          src={champion.splashImage}
          alt={champion.name}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      <div className="player-art-labels">
        <span className="role-chip">{roleLabel(player.competition?.role)}</span>
        {player.competition?.isCaptain && (
          <span className="role-chip player-captain-chip">Capitán</span>
        )}
      </div>
    </div>
  );
}

function PlayerTeam({ player }: { player: Player }) {
  const team = player.competition?.team;
  return (
    <span className="player-team">
      <span>{team?.name ?? 'Sin equipo'}</span>
    </span>
  );
}

export function FeaturedPlayer({
  player,
  catalog = {}
}: { player: Player | undefined; catalog?: GameCatalog }) {
  return (
    <section className="players-featured" aria-labelledby="featured-player-title">
      <h2 className="eyebrow" id="featured-player-title">
        MVP de la jornada
      </h2>
      {player?.competition?.featured ? (
        <SiteLink className="featured-player-card" href={playerHref(player)}>
          <div className="featured-player-portrait">
            <PlayerArt player={player} catalog={catalog} />
          </div>
          <div className="featured-player-body">
            <div className="featured-player-header">
              <span className="featured-player-award">MVP</span>
              <span className="featured-player-round">{player.competition.featured.roundName}</span>
            </div>
            <div className="featured-player-identity">
              <div className="featured-player-identity-text">
                <div className="featured-player-name">
                  <h3>{player.gameName}</h3>
                  {player.riotTag && <span className="featured-player-tag">#{player.riotTag}</span>}
                </div>
                <div className="featured-player-meta">
                  <PlayerTeam player={player} />
                </div>
              </div>
              {player.competition.team && <TeamBadge team={player.competition.team} />}
            </div>
            <dl className="featured-player-stats">
              {playerSortOptions.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{formatPlayerStat(player.competition?.featured?.stats, key)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </SiteLink>
      ) : (
        <div className="empty-state">
          El MVP se anunciará cuando haya enfrentamientos finalizados con estadísticas en la jornada
          actual.
        </div>
      )}
    </section>
  );
}

export function PlayerGrid({
  players,
  sort = 'kda',
  catalog = {}
}: { players: Player[]; sort?: PlayerSort; catalog?: GameCatalog }) {
  const tooltipId = React.useId();
  if (!players.length)
    return <div className="empty-state">No hay jugadores que coincidan con la búsqueda.</div>;
  return (
    <div className="player-grid players-cards">
      {players.map((player) => (
        <SiteLink
          key={player.id}
          className="player-card"
          style={
            {
              '--player-team-color': player.competition?.team?.color || 'var(--purple)'
            } as React.CSSProperties
          }
          href={playerHref(player)}
          aria-label={`Ver jugador ${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''}`}
        >
          <PlayerArt player={player} catalog={catalog} />
          <div className="player-card-body">
            <div className="player-card-identity">
              <div>
                <span className="player-team">
                  {player.competition?.team?.name ?? 'Sin equipo'}
                </span>
                <h3>{player.gameName}</h3>
              </div>
              {player.competition?.team && <TeamBadge team={player.competition.team} />}
            </div>
            {!player.competition?.champion && !player.competition?.stats ? (
              <p className="player-pending-stats">Estadísticas pendientes.</p>
            ) : (
              <dl className="player-card-stats">
                <div aria-describedby={`${tooltipId}-${player.id}-stat`}>
                  <dt>{playerCardStats[sort].label}</dt>
                  <dd>{formatPlayerStat(player.competition?.stats, sort)}</dd>
                  <span
                    className="player-stat-tooltip"
                    role="tooltip"
                    id={`${tooltipId}-${player.id}-stat`}
                  >
                    {playerCardStats[sort].description}
                  </span>
                </div>
              </dl>
            )}
          </div>
        </SiteLink>
      ))}
    </div>
  );
}
