import React, { useState } from 'react';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { TeamGrid } from './TeamGrid.js';
import './teams.css';

export function filterTeams<T extends { name: string; shortName?: string | null }>(
  teams: T[],
  query: string
) {
  const search = query.trim().toLocaleLowerCase('es');
  return teams.filter((team) =>
    `${team.name} ${team.shortName ?? ''}`.toLocaleLowerCase('es').includes(search)
  );
}

export function TeamsPage({ competition }: { competition: Competition }) {
  const [query, setQuery] = useState('');
  const teams = filterTeams(competition.teams.data, query);
  return (
    <PageLayout
      id="equipos"
      number="05"
      title="Equipos"
      subtitle="Una identidad. Una rebelion."
      description="Conoce a los equipos que compiten por dejar su marca en la liga."
      toolbar={
        <CompetitionFilters competition={competition}>
          <label className="select-field">
            Buscar equipo
            <input
              type="search"
              placeholder="Nombre o abreviatura"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </CompetitionFilters>
      }
    >
      <DataState
        state={resolveCompetitionState(competition, competition.teams)}
        empty="Todavia no hay equipos inscritos en esta division."
        retry={competition.retry}
      >
        <TeamGrid teams={teams} divisionName={competition.division?.name} query={query} />
      </DataState>
    </PageLayout>
  );
}
