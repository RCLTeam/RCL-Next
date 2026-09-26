import type { PredictionPick, PredictionsData } from '@rcl/contracts';
import { useEffect, useState } from 'react';
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/predictions/${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? 'Las votaciones ya están cerradas.'
        : 'No se han podido cargar o guardar las predicciones. Inténtalo de nuevo.'
    );
  return (await response.json()).data as T;
}
export function usePredictions(divisionId: string | undefined, userId: string | undefined) {
  const [result, setResult] = useState<{
    key: string;
    data: PredictionsData;
    picks: PredictionPick[];
  } | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const key = `${divisionId}/${userId}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision refreshes server time and votes.
  useEffect(() => {
    if (!divisionId) return;
    const controller = new AbortController();
    setError(false);
    Promise.all([
      request<PredictionsData>(`divisions/${divisionId}`, { signal: controller.signal }),
      userId
        ? request<PredictionPick[]>(`divisions/${divisionId}/mine`, { signal: controller.signal })
        : Promise.resolve([])
    ])
      .then(([data, picks]) => {
        if (!controller.signal.aborted) setResult({ key, data, picks });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
          setResult(null);
        }
      });
    const timer = window.setTimeout(() => setRevision((r) => r + 1), 15000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [divisionId, userId, key, revision]);
  return {
    data: result?.key === key ? result.data : null,
    picks: result?.key === key ? result.picks : [],
    error,
    retry: () => setRevision((r) => r + 1),
    save: async (pick: PredictionPick) => {
      const { matchId, ...body } = pick;
      await request(`matches/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setResult((current) =>
        current?.key === key
          ? { ...current, picks: [...current.picks.filter((p) => p.matchId !== matchId), pick] }
          : current
      );
      setRevision((r) => r + 1);
    }
  };
}
