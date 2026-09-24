import { useState } from 'react';
import type { Division, Season } from '../types/competition.types.js';
import { useCollection } from './useCollection.js';

export function useCompetitionSelection(enabled = true) {
  const [revision, setRevision] = useState(0);
  const [seasonChoice, setSeasonChoice] = useState('');
  const [divisionChoice, setDivisionChoice] = useState('');
  const seasons = useCollection<Season>(enabled ? 'seasons' : null, revision);
  const season = seasons.data.find((item) => item.id === seasonChoice) ?? seasons.data[0];
  const divisions = useCollection<Division>(
    season ? `seasons/${encodeURIComponent(season.id)}/divisions` : null,
    revision
  );
  const division = divisions.data.find((item) => item.id === divisionChoice) ?? divisions.data[0];
  return {
    revision,
    seasons,
    season,
    divisions,
    division,
    selectSeason: (id: string) => {
      setSeasonChoice(id);
      setDivisionChoice('');
    },
    selectDivision: setDivisionChoice,
    retry: () => setRevision((value) => value + 1)
  };
}
