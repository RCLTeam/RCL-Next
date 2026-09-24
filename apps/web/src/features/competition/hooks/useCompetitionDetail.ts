import { useEffect, useState } from 'react';
import { type CompetitionDetails, getCompetitionDetail } from '../api/competition-detail-api.js';

type DetailState<T> = { status: 'loading' | 'error' | 'missing' } | { status: 'ready'; data: T };

export function useCompetitionDetail<K extends keyof CompetitionDetails>(resource: K, id: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    resource: K;
    id: string;
    revision: number;
    state: DetailState<CompetitionDetails[K]>;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    getCompetitionDetail(resource, id, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({
            resource,
            id,
            revision,
            state: data === null ? { status: 'missing' } : { status: 'ready', data }
          });
      },
      () => {
        if (!controller.signal.aborted)
          setResult({ resource, id, revision, state: { status: 'error' } });
      }
    );
    return () => controller.abort();
  }, [resource, id, revision]);
  const state: DetailState<CompetitionDetails[K]> =
    result?.resource === resource && result.id === id && result.revision === revision
      ? result.state
      : { status: 'loading' };
  return { state, retry: () => setRevision((value) => value + 1) };
}
