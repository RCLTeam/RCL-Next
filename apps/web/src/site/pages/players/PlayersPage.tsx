import type { Player, PlayerStatistics } from '@rcl/contracts';
import React, { useState } from 'react';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import { useCollection } from '../../../features/competition/hooks/useCollection.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { Select } from '../../../shared/components/Selector/Selector.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
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
const roles = [
  ['all', 'Todos'],
  ['top', 'Top'],
  ['jungle', 'Jungla'],
  ['mid', 'Mid'],
  ['adc', 'ADC'],
  ['support', 'Support']
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
      toolbar={<CompetitionFilters competition={competition} divisionControl="select" />}
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
            <label className="select-field" htmlFor={sortId}>
              Ordenar por
              <Select
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
            </label>
          </div>
          <p className="players-stat-note">
            De mayor a menor · Estadísticas de temporada · Participación: (kills + asistencias) /
            kills del equipo. Visión y daño mitigado: media por mapa.
          </p>
          <PlayerGrid players={filtered} sort={sort} catalog={catalog} />
        </section>
      </DataState>
    </PageLayout>
  );
}

export function filterPlayers(
  players: Player[],
  query: string,
  role = 'all',
  sort: PlayerSort = 'kda'
) {
  const search = query.trim().toLocaleLowerCase('es');
  return players
    .filter(
      (player) =>
        (role === 'all' || player.competition?.role === role) &&
        `${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''} ${player.displayName ?? ''}`
          .toLocaleLowerCase('es')
          .includes(search)
    )
    .sort((a, b) => {
      const left = a.competition?.stats?.[sort];
      const right = b.competition?.stats?.[sort];
      if (left == null && right != null) return 1;
      if (right == null && left != null) return -1;
      return (
        (right ?? 0) - (left ?? 0) ||
        a.gameName.localeCompare(b.gameName, 'es') ||
        a.id.localeCompare(b.id)
      );
    });
}

function PlayerArt({ player, catalog }: { player: Player; catalog: GameCatalog }) {
  const champion = getGameAsset('champion', player.competition?.champion ?? null, catalog);
  return (
    <div className="player-art">
      <span className="player-art-fallback" aria-hidden="true">
        {player.gameName.slice(0, 2).toUpperCase()}
      </span>
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
      <span className="role-chip">{roleLabel(player.competition?.role)}</span>
    </div>
  );
}

function PlayerTeam({ player }: { player: Player }) {
  const team = player.competition?.team;
  return (
    <span className="player-team">
      {team?.logoUrl && <img src={team.logoUrl} alt="" loading="lazy" />}
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
        Ficha destacada · MVP de la jornada
      </h2>
      {player?.competition?.featured ? (
        <SiteLink className="featured-player-card" href={playerHref(player)}>
          <div>
            <PlayerArt player={player} catalog={catalog} />
            <PlayerTeam player={player} />
          </div>
          <div className="featured-player-body">
            <span className="featured-player-award">
              MVP · {player.competition.featured.roundName}
            </span>
            <h3>{player.gameName}</h3>
            <p>
              {roleLabel(player.competition.role)}
              {player.riotTag ? ` · #${player.riotTag}` : ''}
            </p>
            <dl className="featured-player-stats">
              {(['kda', 'killParticipation', 'csPerMinute', 'winRate'] as const).map((key) => (
                <div key={key}>
                  <dt>{playerSortOptions.find(([value]) => value === key)?.[1]}</dt>
                  <dd>{formatPlayerStat(player.competition?.featured?.stats, key)}</dd>
                </div>
              ))}
            </dl>
            <span className="player-card-action">Ver jugador →</span>
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
  if (!players.length)
    return <div className="empty-state">No hay jugadores que coincidan con la búsqueda.</div>;
  return (
    <div className="player-grid players-cards">
      {players.map((player) => (
        <SiteLink
          key={player.id}
          className="player-card"
          href={playerHref(player)}
          aria-label={`Ver jugador ${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''}`}
        >
          <PlayerArt player={player} catalog={catalog} />
          <div className="player-card-body">
            <PlayerTeam player={player} />
            <h3>{player.gameName}</h3>
            <div className="player-card-stats">
              <span>
                {playerSortOptions.find(([key]) => key === sort)?.[1]}{' '}
                <strong>{formatPlayerStat(player.competition?.stats, sort)}</strong>
              </span>
              {sort !== 'winRate' && (
                <span>{formatPlayerStat(player.competition?.stats, 'winRate')} WR</span>
              )}
            </div>
            <span className="player-card-action">Ver jugador →</span>
          </div>
        </SiteLink>
      ))}
    </div>
  );
}
