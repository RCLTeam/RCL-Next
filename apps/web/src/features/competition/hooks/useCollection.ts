import { useEffect, useState } from 'react';
import { getCollection } from '../api/competition-api.js';
import type { CollectionState } from '../types/competition.types.js';

export function useCollection<T>(path: string | null, revision: number): CollectionState<T> {
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
