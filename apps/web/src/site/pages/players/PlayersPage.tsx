import '../../../features/competition/components/player-card.css';
import React, { useState } from 'react';
import { useCollection } from '../../../features/competition/hooks/useCollection.js';
import type { Player } from '../../../features/competition/types/competition.types.js';
import { DataState } from '../../../shared/components/DataState.js';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { PlayerLeaderboards } from './PlayerLeaderboards.js';
import { PlayerMvpPoll } from './PlayerMvpPoll.js';
import './players.css';
import './ranking-panel.css';

export function PlayersPage() {
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const players = useCollection<Player>('players', revision);
  const filtered = filterPlayers(players.data, query);
  return (
    <PageLayout
      id="jugadores"
      number="06"
      title="Jugadores"
      subtitle="Protagonistas de la rebelión"
      description="Perfiles, plantillas y estadísticas de quienes construyen el legado de RCL."
      toolbar={
        <label className="select-field">
          Buscar jugador
          <input
            type="search"
            placeholder="Nombre o Riot ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      }
    >
      <DataState
        state={players}
        loadingMessage="Cargando jugadores…"
        errorMessage="No se han podido cargar los jugadores."
        empty="Todavía no hay jugadores registrados."
        retry={() => setRevision((value) => value + 1)}
      >
        <PlayerGrid players={filtered} />
      </DataState>
      <PlayerLeaderboards />
      <PlayerMvpPoll />
    </PageLayout>
  );
}

export function filterPlayers(players: Player[], query: string) {
  const search = query.trim().toLocaleLowerCase('es');
  return players.filter((player) =>
    `${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''} ${player.displayName ?? ''}`
      .toLocaleLowerCase('es')
      .includes(search)
  );
}

export function PlayerGrid({ players }: { players: Player[] }) {
  if (!players.length)
    return <div className="empty-state">No hay jugadores que coincidan con la búsqueda.</div>;
  return (
    <div className="player-grid">
      {players.map((player) => (
        <SiteLink
          key={player.id}
          className="player-card"
          href={`/jugadores/${encodeURIComponent(player.slug ?? player.id)}`}
          aria-label={`Ver jugador ${player.gameName}${player.riotTag ? `#${player.riotTag}` : ''}`}
        >
          <span className="player-monogram" aria-hidden="true">
            {player.gameName.slice(0, 2).toUpperCase()}
          </span>
          <span className="meta">{player.isMain ? 'Cuenta principal' : 'Cuenta registrada'}</span>
          <h2>{player.gameName}</h2>
          <p>
            {player.riotTag ? `#${player.riotTag}` : 'Tag no disponible'}
            {player.countryCode ? ` · ${player.countryCode.toUpperCase()}` : ''}
          </p>
          <span className="player-card-action">Ver jugador →</span>
        </SiteLink>
      ))}
    </div>
  );
}
