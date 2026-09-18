import React from 'react';
import { CompetitionFilters } from '../../site/components/CompetitionFilters.js';
import {
  DataState,
  TeamBadge,
  resolveCompetitionState
} from '../../site/components/CompetitionViews.js';
import { PageLayout } from '../../site/components/PageLayout.js';
import type { Competition } from '../hooks/useCompetition.js';

export function StandingsPage({ competition }: { competition: Competition }) {
  return (
    <PageLayout
      id="clasificacion"
      number="04"
      title="Clasificación"
      subtitle="El camino a la corona"
      description="Sigue las victorias, los mapas y la posición de cada equipo en la fase regular."
      toolbar={
        <CompetitionFilters competition={competition}>
          <span className="meta">
            Fase regular · {competition.division?.name ?? 'Competición RCL'}
          </span>
        </CompetitionFilters>
      }
    >
      <DataState
        state={resolveCompetitionState(competition, competition.standings)}
        empty="La clasificación se publicará cuando haya equipos inscritos."
        retry={competition.retry}
      >
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll wide tables. */}
        <section className="table-scroll" aria-label="Tabla de clasificación" tabIndex={0}>
          <table className="standings-table">
            <caption className="sr-only">Clasificación de la fase regular</caption>
            <thead>
              <tr>
                {['Pos', 'Equipo', 'PJ', 'V', 'D', 'Mapas +', 'Mapas −', 'Diferencia'].map(
                  (label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {competition.standings.data.map((row) => (
                <tr key={row.team.id}>
                  <td className="rank">{row.position}</td>
                  <th scope="row">
                    <span className="team-cell">
                      <TeamBadge team={row.team} />
                      {row.team.name}
                    </span>
                  </th>
                  <td>{row.played}</td>
                  <td className="wins">{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.mapsWon}</td>
                  <td>{row.mapsLost}</td>
                  <td>
                    {row.mapDifference > 0 ? '+' : ''}
                    {row.mapDifference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </DataState>
    </PageLayout>
  );
}
