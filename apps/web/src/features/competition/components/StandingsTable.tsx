import React from 'react';
import type { Standing } from '../types/competition.types.js';
import { TeamBadge } from './TeamBadge.js';

export function StandingsTable({ rows }: { rows: Standing[] }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll wide tables.
    <section className="table-scroll" aria-label="Tabla de clasificación" tabIndex={0}>
      <table className="standings-table">
        <caption className="sr-only">Clasificación de la fase regular</caption>
        <thead>
          <tr>
            {['Pos', 'Equipo', 'PJ', 'V', 'D', 'Mapas +', 'Mapas −', 'Diferencia'].map((label) => (
              <th scope="col" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team.id}>
              <td className="rank">{row.position}</td>
              <th scope="row">
                <span className="team-cell">
                  <TeamBadge team={row.team} />
                  {row.team.name}
                </span>
              </th>
              <td>{row.played ?? 0}</td>
              <td className="wins">{row.wins ?? 0}</td>
              <td className="losses">{row.losses ?? 0}</td>
              <td>{row.mapsWon ?? 0}</td>
              <td>{row.mapsLost ?? 0}</td>
              <td>
                {(row.mapDifference ?? 0) > 0 ? '+' : ''}
                {row.mapDifference ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
