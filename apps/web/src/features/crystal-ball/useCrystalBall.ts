import type { CrystalAnswers, CrystalBallData } from '@rcl/contracts';
import { useEffect, useState } from 'react';

async function request<T>(
  season: string,
  divisionId: string,
  path = '',
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `/api/v1/crystal-ball/${encodeURIComponent(season)}/${encodeURIComponent(divisionId)}${path}`,
    {
      credentials: 'include',
      cache: 'no-store',
      ...options
    }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const errors: Record<string, string> = {
      CRYSTAL_CLOSED: 'La votación está cerrada. No se puede guardar ni reabrir.',
      CRYSTAL_NOT_CLOSED: 'Espera al cierre para publicar resultados.',
      INVALID_WINDOW:
        'Revisa las fechas: el cierre debe ser futuro y anterior o igual al inicio de playoffs.',
      INCOMPLETE_BALLOT: 'Completa todas las predicciones antes de guardar.',
      INVALID_ANSWER: 'Revisa las selecciones y el número de equipos.',
      DUPLICATE_TEAM: 'Un equipo no puede estar en ambas ramas.',
      PLAYOFFS_UNFINISHED: 'Todas las series de playoffs deben haber terminado.',
      MISSING_MAPS: 'Faltan mapas de playoffs por importar.'
    };
    throw new Error(
      errors[String(body?.error?.code)] ??
        'No se ha podido completar la operación. Inténtalo de nuevo.'
    );
  }
  return (await response.json()).data as T;
}

export function useCrystalBall(season: string, divisionId: string, userId: string | undefined) {
  const [data, setData] = useState<CrystalBallData | null>(null);
  const [answers, setAnswers] = useState<CrystalAnswers | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly refreshes the campaign.
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    Promise.all([
      request<CrystalBallData>(season, divisionId, '', { signal: controller.signal }),
      userId
        ? request<CrystalAnswers>(season, divisionId, '/mine', { signal: controller.signal })
        : Promise.resolve({})
    ])
      .then(([next, mine]) => {
        if (!controller.signal.aborted) {
          setData(next);
          setAnswers(mine);
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'No se pudieron cargar las predicciones.');
      });
    const timer = window.setTimeout(() => setRevision((r) => r + 1), 15000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [season, divisionId, userId, revision]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setData((current) =>
        current?.status === 'open' && current.closesAt && now >= Date.parse(current.closesAt)
          ? { ...current, status: 'closed' }
          : current
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);
  const mutate = async (path: string, body: unknown) => {
    await request(season, divisionId, path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    setRevision((r) => r + 1);
  };
  return {
    data,
    answers,
    error,
    retry: () => setRevision((r) => r + 1),
    save: (body: CrystalAnswers) => mutate('/mine', body),
    configure: (opensAt: string, closesAt: string) => mutate('/window', { opensAt, closesAt }),
    resolve: (body: CrystalAnswers, finalize: boolean) =>
      mutate('/results', { answers: body, finalize })
  };
}
