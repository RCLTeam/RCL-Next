import type { Player, PlayerStatistics } from '@rcl/contracts';
import { isCompetitiveRole } from '@rcl/contracts';
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
import { ChampionArt } from '../../../shared/riot/ChampionArt.js';
import { type GameCatalog, getGameAsset } from '../../../shared/riot/riot-assets.service.js';
import { useGameCatalog } from '../../../shared/riot/useGameCatalog.js';
import './players.css';

export const playerSortOptions = [
  ['kda', 'KDA'],
  ['mvps', 'MVPs'],
  ['csPerMinute', 'CS/min'],
  ['killParticipation', 'Kill participation'],
  ['winRate', '% de victorias'],
  ['damagePerMinute', 'Daño a campeones/min'],
  ['visionScore', 'Puntuacion de vision'],
  ['damageMitigated', 'Daño mitigado']
] as const;
export type PlayerSort = (typeof playerSortOptions)[number][0];
const playerCardStats: Record<PlayerSort, string> = {
  kda: 'KDA',
  mvps: 'MVPs',
  csPerMinute: 'CS/min',
  killParticipation: 'KP',
  winRate: 'WR',
  damagePerMinute: 'Daño/min',
  visionScore: 'Vision',
  damageMitigated: 'Mitigado'
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
  roles.find(([key]) => key === role)?.[1] ?? 'Sin posicion';
const playerHref = (player: Player) => `/jugadores/${encodeURIComponent(player.slug ?? player.id)}`;

export function formatPlayerStat(
  stats: PlayerStatistics | null | undefined,
  key: PlayerSort,
  mvps?: number
) {
  if (key === 'mvps') return mvps?.toLocaleString('es') ?? '—';
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
      subtitle="Protagonistas de la rebelion"
      description="El MVP de la jornada y todos los protagonistas de RCL, con sus estadisticas de temporada."
      toolbar={<CompetitionFilters competition={competition} />}
    >
      <DataState
        state={resolveCompetitionState(competition, players)}
        loadingMessage="Cargando jugadores…"
        errorMessage="No se han podido cargar los jugadores."
        empty="Todavia no hay jugadores registrados en esta temporada y division."
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
            <fieldset className="players-roles" aria-label="Filtrar por posicion">
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
      const hasAwards = Boolean(player.competition?.mvpMatchIds.length);

      let matchesRole = false;
      if (role === 'all') {
        matchesRole = isCompetitiveRole(playerRole) || hasStats || hasAwards;
      } else {
        matchesRole = isCompetitiveRole(role) && playerRole === role;
      }

      const matchesQuery =
        `${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''} ${player.displayName ?? ''}`
          .toLocaleLowerCase('es')
          .includes(search);

      return matchesRole && matchesQuery;
    })
    .sort((a, b) => {
      const left =
        sort === 'mvps' ? (a.competition?.mvpMatchIds.length ?? 0) : a.competition?.stats?.[sort];
      const right =
        sort === 'mvps' ? (b.competition?.mvpMatchIds.length ?? 0) : b.competition?.stats?.[sort];
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
          <span className="player-unplayed-label">Sin campeon registrado</span>
        </>
      )}
      {champion?.splashImage && (
        <ChampionArt asset={champion} variant="centered" alt={champion.name} />
      )}
      <div className="player-art-labels">
        <span className="role-chip">{roleLabel(player.competition?.role)}</span>
        {player.competition?.isCaptain && (
          <span className="role-chip player-captain-chip">Capitan</span>
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
        <SiteLink
          className="featured-player-card"
          href={playerHref(player)}
          style={
            {
              '--player-team-color': player.competition.team?.color || 'var(--purple)'
            } as React.CSSProperties
          }
        >
          <div className="featured-player-portrait">
            <PlayerArt player={player} catalog={catalog} />
          </div>
          <div className="featured-player-body">
            <div className="featured-player-identity">
              <div className="featured-player-identity-text">
                <div className="featured-player-header">
                  <span className="featured-player-award">MVP</span>
                  <span className="featured-player-round">
                    {player.competition.featured.roundName}
                  </span>
                </div>
                <div className="featured-player-name">
                  <h3 title={player.gameName}>{player.gameName}</h3>
                  {player.riotTag && <span className="featured-player-tag">#{player.riotTag}</span>}
                </div>
                <div className="featured-player-meta">
                  <PlayerTeam player={player} />
                </div>
              </div>
              {player.competition.champion && resolveTeamLogo(player.competition.team?.logoUrl) && (
                <div className="player-identity-emblem">
                  <TeamBadge team={player.competition.team} />
                </div>
              )}
            </div>
            <dl className="featured-player-stats">
              {playerSortOptions
                .filter(([key]) => key !== 'mvps')
                .map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{formatPlayerStat(player.competition?.featured?.stats, key)}</dd>
                  </div>
                ))}
              <div>
                <dt>MVPs de temporada</dt>
                <dd>{player.competition.mvpMatchIds.length}</dd>
              </div>
            </dl>
          </div>
        </SiteLink>
      ) : (
        <div className="empty-state">
          Todavia no hay un MVP de jornada disponible en esta division.
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
    return <div className="empty-state">No hay jugadores que coincidan con la busqueda.</div>;
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
                <h3 title={player.gameName}>{player.gameName}</h3>
                <dl className="player-card-selected-stat">
                  <div>
                    <dt>{playerCardStats[sort]}</dt>
                    <dd>
                      {formatPlayerStat(
                        player.competition?.stats,
                        sort,
                        player.competition?.mvpMatchIds.length ?? 0
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
              {player.competition?.champion &&
                resolveTeamLogo(player.competition.team?.logoUrl) && (
                  <div className="player-identity-emblem">
                    <TeamBadge team={player.competition.team} />
                  </div>
                )}
            </div>
          </div>
        </SiteLink>
      ))}
    </div>
  );
}
