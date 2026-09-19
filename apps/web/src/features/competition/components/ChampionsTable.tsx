import React from 'react';

export function ChampionsTable() {
  return (
    <div className="paper champion-panel">
      <div className="table-scroll">
        <table className="standings-table champion-table">
          <caption className="sr-only">Estadísticas de campeones de la competición</caption>
          <thead>
            <tr>
              {['#', 'Campeón', 'Pick %', 'Ban %', 'Win %', 'Partidas'].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="table-empty">
                Las estadísticas de campeones todavía no están disponibles.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
