import { useState } from 'react';
import type { Division, Season } from '../types/competition.types.js';
import { useCollection } from './useCollection.js';

export function sortSeasons(seasons: Season[]) {
  return [...seasons].sort(
    (a, b) =>
      Number(!b.endsOn) - Number(!a.endsOn) || (b.startsOn ?? '').localeCompare(a.startsOn ?? '')
  );
}

export function currentSeason(seasons: Season[], today = new Date().toLocaleDateString('en-CA')) {
  return sortSeasons(seasons).find(
    (season) =>
      !season.endsOn || ((!season.startsOn || season.startsOn <= today) && season.endsOn >= today)
  );
}

export function useCompetitionSelection(enabled = true, currentOnly = false) {
  const [revision, setRevision] = useState(0);
  const [seasonChoice, setSeasonChoice] = useState('');
  const [divisionChoice, setDivisionChoice] = useState('');
  const seasonCollection = useCollection<Season>(enabled ? 'seasons' : null, revision);
  const seasons = { ...seasonCollection, data: sortSeasons(seasonCollection.data) };
  const season = currentOnly
    ? currentSeason(seasons.data)
    : (seasons.data.find((item) => item.id === seasonChoice) ?? seasons.data[0]);
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
    selectDivision: (id: string) => {
      if (season) setSeasonChoice(season.id);
      setDivisionChoice(id);
    },
    retry: () => setRevision((value) => value + 1)
  };
}
