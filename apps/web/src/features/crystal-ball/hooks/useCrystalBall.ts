import type { CrystalAnswers, CrystalBallData } from '@rcl/contracts';
import { useEffect, useRef, useState } from 'react';

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
      CRYSTAL_CLOSED: 'La votacion esta cerrada. No se puede guardar ni reabrir.',
      CRYSTAL_NOT_CLOSED: 'Espera al cierre para publicar resultados.',
      INVALID_WINDOW:
        'Revisa las fechas: el cierre debe ser futuro y anterior o igual al inicio de playoffs.',
      INCOMPLETE_BALLOT: 'Completa todas las predicciones antes de guardar.',
      INVALID_ANSWER: 'Revisa las selecciones y el numero de equipos.',
      DUPLICATE_TEAM: 'Un equipo no puede estar en ambas ramas.',
      PLAYOFFS_UNFINISHED: 'Todas las series de playoffs deben haber terminado.',
      MISSING_MAPS: 'Faltan mapas de playoffs por importar.'
    };
    throw new Error(
      errors[String(body?.error?.code)] ??
        'No se ha podido completar la operacion. Intentalo de nuevo.'
    );
  }
  return (await response.json()).data as T;
}

export function useCrystalBall(season: string, divisionId: string, userId: string | undefined) {
  const generation = useRef(0);
  const mutation = useRef<number | null>(null);
  const key = `${season}/${divisionId}/${userId ?? ''}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: CrystalBallData | null;
    answers: CrystalAnswers | null;
    error: string;
  }>({ key, data: null, answers: null, error: '' });
  const current = snapshot.key === key ? snapshot : { data: null, answers: null, error: '' };
  const [revision, setRevision] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly refreshes the campaign.
  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    setSnapshot((previous) =>
      previous.key === key
        ? { ...previous, error: '' }
        : { key, data: null, answers: null, error: '' }
    );
    Promise.all([
      request<CrystalBallData>(season, divisionId, '', { signal: controller.signal }),
      userId
        ? request<CrystalAnswers>(season, divisionId, '/mine', { signal: controller.signal })
        : Promise.resolve({})
    ])
      .then(([next, mine]) => {
        if (!controller.signal.aborted && generation.current === version) {
          setSnapshot({ key, data: next, answers: mine, error: '' });
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted && generation.current === version)
          setSnapshot((previous) => ({
            ...previous,
            key,
            error: e instanceof Error ? e.message : 'No se pudieron cargar las predicciones.'
          }));
      });
    const timer = window.setTimeout(() => {
      if (mutation.current === null) setRevision((r) => r + 1);
    }, 15000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [season, divisionId, userId, revision, key]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setSnapshot((previous) =>
        previous.data?.status === 'open' &&
        previous.data.closesAt &&
        now >= Date.parse(previous.data.closesAt)
          ? { ...previous, data: { ...previous.data, status: 'closed' } }
          : previous
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);
  const mutate = async (path: string, body: unknown) => {
    const version = ++generation.current;
    mutation.current = version;
    try {
      await request(season, divisionId, path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const [data, answers] = await Promise.all([
        request<CrystalBallData>(season, divisionId),
        userId ? request<CrystalAnswers>(season, divisionId, '/mine') : Promise.resolve({})
      ]);
      setSnapshot((previous) =>
        previous.key === key && generation.current === version
          ? { key, data, answers, error: '' }
          : previous
      );
    } finally {
      if (mutation.current === version) mutation.current = null;
      setRevision((r) => r + 1);
    }
  };
  return {
    data: current.data,
    answers: current.answers,
    error: current.error,
    retry: () => setRevision((r) => r + 1),
    save: (body: CrystalAnswers) => mutate('/mine', body),
    configure: (opensAt: string, closesAt: string) => mutate('/window', { opensAt, closesAt }),
    resolve: (body: CrystalAnswers, finalize: boolean) =>
      mutate('/results', { answers: body, finalize })
  };
}
