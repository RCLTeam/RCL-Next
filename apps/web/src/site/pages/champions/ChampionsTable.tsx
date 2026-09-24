import type { ChampionStats } from '@rcl/contracts';
import React, { useState } from 'react';
import { GameIcon } from '../../../shared/riot/GameIcon.js';
import type { GameCatalog } from '../../../shared/riot/riot-assets.service.js';
import { getGameAsset } from '../../../shared/riot/riot-assets.service.js';

export type ChampionOrder = 'games' | 'winRate' | 'name';
const percent = (value: number | null) =>
  value === null ? '—' : `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
const nameOf = (row: ChampionStats, catalog: GameCatalog) =>
  getGameAsset('champion', row.champion, catalog)?.name ?? row.champion;

export function filterChampionStats(
  rows: ChampionStats[],
  catalog: GameCatalog,
  query: string,
  order: ChampionOrder
) {
  const search = normalize(query.trim());
  return rows
    .filter((row) => normalize(`${nameOf(row, catalog)} ${row.champion}`).includes(search))
    .sort(
      (a, b) =>
        (order === 'name' ? 0 : b[order] - a[order]) ||
        nameOf(a, catalog).localeCompare(nameOf(b, catalog), 'es')
    );
}

export function ChampionsTable({
  rows = [],
  catalog = {}
}: { rows?: ChampionStats[]; catalog?: GameCatalog }) {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<ChampionOrder>('games');
  const filtered = filterChampionStats(rows, catalog, query, order);
  return (
    <div className="paper champion-panel">
      <div className="champion-controls">
        <label className="select-field">
          Buscar campeón
          <input
            type="search"
            value={query}
            placeholder="Nombre del campeón"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="select-field">
          Ordenar por
          <select value={order} onChange={(event) => setOrder(event.target.value as ChampionOrder)}>
            <option value="games">Más jugados</option>
            <option value="winRate">Porcentaje de victorias</option>
            <option value="name">Nombre</option>
          </select>
        </label>
        <output className="meta">
          {filtered.length} campeones · {rows[0]?.totalGames ?? 0} mapas analizados
        </output>
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Enable keyboard scrolling. */}
      <section className="table-scroll" aria-label="Estadísticas de campeones" tabIndex={0}>
        <table className="standings-table champion-table">
          <caption className="sr-only">Estadísticas de campeones de la competición</caption>
          <thead>
            <tr>
              {['#', 'Campeón', 'Pick %', 'Win %', 'Partidas', 'Victorias', 'Derrotas'].map(
                (label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr key={row.champion}>
                <td>{index + 1}</td>
                <th scope="row">
                  <GameIcon kind="champion" id={row.champion} catalog={catalog} label />
                </th>
                <td>{percent(row.pickRate)}</td>
                <td>{percent(row.winRate)}</td>
                <td>{row.games}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7} className="table-empty">
                  {rows.length
                    ? 'No hay campeones que coincidan con la búsqueda.'
                    : 'Las estadísticas de campeones todavía no están disponibles.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
