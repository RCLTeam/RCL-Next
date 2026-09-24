import React, { useState } from 'react';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { TeamGrid } from './TeamGrid.js';
import './teams.css';

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
        <TeamGrid teams={teams} divisionName={competition.division?.name} query={query} />
      </DataState>
    </PageLayout>
  );
}
