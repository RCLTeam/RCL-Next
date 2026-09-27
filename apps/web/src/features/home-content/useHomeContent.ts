import { useEffect, useState } from 'react';
import { contentRequest } from './home-content-api.js';

export function useHomeContent<T>(path: string | null) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    revision: number;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    contentRequest<T>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ path, revision, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            path,
            revision,
            error: error instanceof Error ? error.message : 'No se pudo cargar el contenido.'
          });
      }
    );
    return () => controller.abort();
  }, [path, revision]);
  const current = result?.path === path && result?.revision === revision ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: !!path && !current,
    retry: () => setRevision((value) => value + 1)
  };
}
