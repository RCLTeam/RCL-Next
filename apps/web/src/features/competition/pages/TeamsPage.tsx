import React, { useState } from 'react';
import { CompetitionFilters } from '../../site/components/CompetitionFilters.js';
import {
  DataState,
  TeamBadge,
  resolveCompetitionState
} from '../../site/components/CompetitionViews.js';
import { PageLayout } from '../../site/components/PageLayout.js';
import type { Competition } from '../hooks/useCompetition.js';

export function TeamsPage({ competition }: { competition: Competition }) {
  const [query, setQuery] = useState('');
  const teams = competition.teams.data.filter((team) =>
    team.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))
  );
  return (
    <PageLayout
      id="equipos"
      number="05"
      title="Equipos"
      subtitle="Una identidad. Una rebelión."
      description="Conoce a los equipos que compiten por dejar su marca en la liga."
      toolbar={
        <CompetitionFilters competition={competition}>
          <label className="select-field">
            Buscar equipo
            <input
              type="search"
              placeholder="Nombre del equipo"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </CompetitionFilters>
      }
    >
      <DataState
        state={resolveCompetitionState(competition, competition.teams)}
        empty="Todavía no hay equipos inscritos en esta división."
        retry={competition.retry}
      >
        <div className="team-grid">
          {teams.map((team) => (
            <article className="team-card" key={team.id}>
              <div className="team-card-art">
                <TeamBadge team={team} />
              </div>
              <div className="team-card-body">
                <span className="meta">{competition.division?.name}</span>
                <h3>{team.name}</h3>
                <span className="team-tag">{team.shortName ?? 'RCL'}</span>
              </div>
            </article>
          ))}
        </div>
        {!teams.length && (
          <div className="empty-state">No hay equipos que coincidan con «{query}».</div>
        )}
      </DataState>
    </PageLayout>
  );
}
