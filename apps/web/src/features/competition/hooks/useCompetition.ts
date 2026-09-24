import type { Match, Round, Standing, Team } from '../types/competition.types.js';
import { useCollection } from './useCollection.js';
import { useCompetitionSelection } from './useCompetitionSelection.js';

export type CompetitionResource = 'teams' | 'rounds' | 'calendar' | 'standings';

export function useCompetition(
  resources: readonly CompetitionResource[] | false = ['teams', 'rounds', 'calendar', 'standings']
) {
  const selection = useCompetitionSelection(resources !== false);
  const { division, revision } = selection;
  const prefix = division ? `divisions/${encodeURIComponent(division.id)}` : null;
  const path = (resource: CompetitionResource, suffix: string = resource) =>
    prefix && resources !== false && resources.includes(resource) ? `${prefix}/${suffix}` : null;
  const teams = useCollection<Team>(path('teams'), revision);
  const rounds = useCollection<Round>(path('rounds'), revision);
  const calendar = useCollection<Match>(path('calendar'), revision);
  const standings = useCollection<Standing>(path('standings', 'standings?stage=regular'), revision);
  // Keep the public screen model independent from the selection hook's retry counter.
  return {
    seasons: selection.seasons,
    season: selection.season,
    divisions: selection.divisions,
    division,
    selectSeason: selection.selectSeason,
    selectDivision: selection.selectDivision,
    retry: selection.retry,
    teams,
    rounds,
    calendar,
    standings
  };
}

export type Competition = ReturnType<typeof useCompetition>;
