import { useEffect, useState } from 'react';
import { getCollection } from '../api/competition-api.js';
import type {
  CollectionState,
  Division,
  Match,
  Round,
  Season,
  Standing,
  Team
} from '../types/competition.types.js';

function useCollection<T>(path: string | null, revision: number): CollectionState<T> {
  const [result, setResult] = useState<{
    path: string | null;
    revision: number;
    state: CollectionState<T>;
  }>();
  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    getCollection<T>(path, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({ path, revision, state: { status: 'ready', data } });
      },
      () => {
        if (!controller.signal.aborted)
          setResult({ path, revision, state: { status: 'error', data: [] } });
      }
    );
    return () => controller.abort();
  }, [path, revision]);
  // Never show the previous division's results during a selection change.
  if (path === null) return { status: 'ready', data: [] };
  return result?.path === path && result.revision === revision
    ? result.state
    : { status: 'loading', data: [] };
}

export function useCompetition() {
  const [revision, setRevision] = useState(0);
  const [seasonChoice, setSeasonChoice] = useState('');
  const [divisionChoice, setDivisionChoice] = useState('');
  const seasons = useCollection<Season>('seasons', revision);
  const season =
    seasons.data.find((item) => item.id === seasonChoice) ??
    seasons.data.find((item) => item.isActive) ??
    seasons.data[0];
  const divisions = useCollection<Division>(
    season ? `seasons/${encodeURIComponent(season.id)}/divisions` : null,
    revision
  );
  const division = divisions.data.find((item) => item.id === divisionChoice) ?? divisions.data[0];
  const prefix = division ? `divisions/${encodeURIComponent(division.id)}` : null;
  const teams = useCollection<Team>(prefix ? `${prefix}/teams` : null, revision);
  const rounds = useCollection<Round>(prefix ? `${prefix}/rounds` : null, revision);
  const calendar = useCollection<Match>(prefix ? `${prefix}/calendar` : null, revision);
  const standings = useCollection<Standing>(
    prefix ? `${prefix}/standings?stage=regular` : null,
    revision
  );
  return {
    seasons,
    season,
    divisions,
    division,
    teams,
    rounds,
    calendar,
    standings,
    selectSeason: (id: string) => {
      setSeasonChoice(id);
      setDivisionChoice('');
    },
    selectDivision: setDivisionChoice,
    retry: () => setRevision((value) => value + 1)
  };
}

export type Competition = ReturnType<typeof useCompetition>;
