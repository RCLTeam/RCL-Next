import { brandAssets } from '../../shared/resources/assets.js';
import { CompetitionFormat } from './components/CompetitionFormat.js';
import './leagues.css';
import React from 'react';
import { SiteLink } from '../../navigation.js';
import type { Competition } from '../../shared/competition/hooks/useCompetition.js';
import { CompetitionFilters } from '../../shared/components/CompetitionFilters.js';
import { DataState } from '../../shared/components/CompetitionViews.js';
import { PageLayout } from '../../shared/components/PageLayout.js';
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
                  src={brandAssets[index % 2 === 0 ? 'premier' : 'ascend']}
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
      <CompetitionFormat />
    </PageLayout>
  );
}
