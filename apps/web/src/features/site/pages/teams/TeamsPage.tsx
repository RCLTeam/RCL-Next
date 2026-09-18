import { TeamCard } from './components/TeamCard.js';
import './teams.css';
import React, { useState } from 'react';
import type { Competition } from '../../shared/competition/hooks/useCompetition.js';
import { CompetitionFilters } from '../../shared/components/CompetitionFilters.js';
import { DataState, resolveCompetitionState } from '../../shared/components/CompetitionViews.js';
import { PageLayout } from '../../shared/components/PageLayout.js';

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
            <TeamCard key={team.id} team={team} divisionName={competition.division?.name} />
          ))}
        </div>
        {!teams.length && (
          <div className="empty-state">No hay equipos que coincidan con «{query}».</div>
        )}
      </DataState>
    </PageLayout>
  );
}
