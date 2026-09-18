import React from 'react';
import type { Competition } from '../../competition/hooks/useCompetition.js';
import { CompetitionFilters } from '../components/CompetitionFilters.js';
import { DataState } from '../components/CompetitionViews.js';
import { PageLayout } from '../components/PageLayout.js';
import { SiteLink } from '../navigation.js';
export function LeaguesPage({ competition }: { competition: Competition }) {
  return (
    <PageLayout
      id="ligas"
      number="02"
      title="Ligas"
      subtitle="Hub de competiciones"
      description="Descubre las divisiones, el formato de la competición y el camino hacia la corona."
      toolbar={<CompetitionFilters competition={competition} />}
    >
      <DataState
        state={competition.seasons}
        retry={competition.retry}
        empty="Todavía no hay temporadas publicadas."
      >
        <DataState
          state={competition.divisions}
          retry={competition.retry}
          empty="Esta temporada todavía no tiene divisiones."
        >
          <div className="league-grid">
            {competition.divisions.data.map((division, index) => (
              <article
                className={`league-card ${index % 2 === 0 ? 'premier' : 'ascend'}`}
                key={division.id}
              >
                <img
                  src={`/brand/${index % 2 === 0 ? 'premier' : 'ascend'}.png`}
                  alt=""
                  loading="lazy"
                />
                <span className="meta">{competition.season?.name}</span>
                <h3>{division.name}</h3>
                <p>Consulta los equipos, las jornadas y la clasificación de esta división.</p>
                <SiteLink
                  className="btn-ghost"
                  href="/clasificacion"
                  onClick={() => competition.selectDivision(division.id)}
                >
                  Ver clasificación →
                </SiteLink>
              </article>
            ))}
          </div>
        </DataState>
      </DataState>
      <div className="format-grid">
        {[
          [
            '01',
            'Fase regular',
            'Cada serie cuenta. Sigue las jornadas y la evolución de la clasificación.'
          ],
          [
            '02',
            'Playoffs',
            'Consulta los enfrentamientos publicados y los resultados de cada eliminatoria.'
          ],
          ['03', 'La corona', 'El desenlace de una temporada y el comienzo de un nuevo legado.']
        ].map(([number, title, text]) => (
          <article className="format-card" key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </PageLayout>
  );
}
