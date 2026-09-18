import React from 'react';
import { PageLayout } from '../components/PageLayout.js';

export function ChampionsPage() {
  return (
    <PageLayout
      id="campeones"
      number="07"
      title="Campeones"
      subtitle="Estadísticas de juego"
      description="Pick, ban y porcentaje de victorias de cada campeón en Rift Premier y Rift Ascend."
      toolbar={
        <>
          <span className="meta">Meta de la competición</span>
          <span className="availability">Próximamente</span>
        </>
      }
    >
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
    </PageLayout>
  );
}
