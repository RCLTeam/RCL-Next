# Hooks Headless y Sincronización: Match Predictions

[⬅️ Volver a Componentes](components.md) | [Siguiente: Páginas ➡️](pages.md)

---

## 1. Visión General de la Sincronización

La comunicación de red, la reactividad y la gestión de votos en cliente residen de forma desacoplada en el hook headless `usePredictions` (`apps/web/src/features/predictions/usePredictions.ts`).

Este hook resuelve cuatro requisitos críticos:
1. Recuperación atómica y paralela del resumen público de la división y de los votos personales del usuario mediante `Promise.all`.
2. Soporte de consulta histórica y actual de jornadas mediante el parámetro opcional `roundId`, componiendo la ruta mediante la función auxiliar `predictionsOverviewPath`.
3. Sondeo en segundo plano (*polling*) cada 15 segundos para sincronizar el estado de la ventana de votación según la hora del servidor y actualizar los porcentajes al finalizar cada partido.
4. Mutación optimista inmediata al guardar un pronóstico, reflejando el voto en pantalla antes de que concluya el viaje de ida y vuelta a la red.

---

## 2. Implementación de `usePredictions`

```typescript
// apps/web/src/features/predictions/usePredictions.ts
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

export function predictionsOverviewPath(divisionId: string, roundId?: string) {
  return roundId
    ? `divisions/${divisionId}?${new URLSearchParams({ roundId })}`
    : `divisions/${divisionId}`;
}

export function usePredictions(
  divisionId: string | undefined,
  userId: string | undefined,
  roundId?: string
) {
  const [result, setResult] = useState<{
    key: string;
    data: PredictionsData;
    picks: PredictionPick[];
  } | null>(null);
  const [currentRound, setCurrentRound] = useState<{
    divisionId: string | undefined;
    id: string | null;
  } | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const key = `${divisionId}/${roundId ?? ''}/${userId}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision refreshes server time and votes.
  useEffect(() => {
    if (!divisionId) return;
    const controller = new AbortController();
    setError(false);
    Promise.all([
      request<PredictionsData>(predictionsOverviewPath(divisionId, roundId), {
        signal: controller.signal
      }),
      userId
        ? request<PredictionPick[]>(`divisions/${divisionId}/mine`, { signal: controller.signal })
        : Promise.resolve([])
    ])
      .then(([data, picks]) => {
        if (controller.signal.aborted) return;
        setResult({ key, data, picks });
        setCurrentRound({ divisionId, id: data.currentRound });
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
  }, [divisionId, roundId, userId, key, revision]);

  return {
    data: result?.key === key ? result.data : null,
    currentRound: currentRound?.divisionId === divisionId ? (currentRound?.id ?? null) : null,
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
```

---

## 3. Mecanismos de Ingeniería del Hook

### 3.1 Consulta Paralela, Clave Reactiva y Cancelación con `AbortController`
- **Clave Unificada (`key`):** Se construye como `${divisionId}/${roundId ?? ''}/${userId}`, vinculando el resultado en memoria a la combinación de división, jornada solicitada y usuario autenticado.
- **Cancelación Activa:** Cuando la división o la jornada cambian (o se incrementa `revision`), o al desmontar el componente, la función de limpieza del efecto invoca `controller.abort()`, cancelando inmediatamente las peticiones HTTP en vuelo.
- **Descarte de Respuestas Obsoletas:** Al resolver las promesas concurrentes, el callback verifica `if (controller.signal.aborted) return`. Además, al exponer los datos a la interfaz, el hook valida `result?.key === key ? result.data : null`. Si una respuesta retardada de otra jornada llegase fuera de orden, se descarta y no contamina el estado visible.
- **Peticiones Concurrentes:** Mediante `Promise.all`, se solicitan en paralelo:
  1. `predictionsOverviewPath(divisionId, roundId)`: Datos públicos de la jornada solicitada (o de la actual si `roundId` es `undefined`), con partidos, estado de votaciones y clasificación de la temporada.
  2. `divisions/${divisionId}/mine`: Votos personales del usuario autenticado en la división (o `Promise.resolve([])` si el visitante navega de forma anónima).

### 3.2 Sondeo Periódico a 15 Segundos
```typescript
const timer = window.setTimeout(() => setRevision((r) => r + 1), 15000);
```
- Establece un temporizador que incrementa el contador de `revision` cada 15 segundos.
- **Utilidad Práctica:**
  - Detecta automáticamente el momento exacto en que un partido pasa a estar en curso (`now >= scheduledAt`), bloqueando el formulario en cliente sin requerir recarga manual.
  - Detecta el cierre individual una hora antes del inicio y recoge los porcentajes cuando el servidor registra el partido como `completed` o `forfeit`.

### 3.3 Mutación Optimista y Consolidación (`save`)
1. **Petición HTTP:** Emite una solicitud `PUT /api/v1/predictions/matches/:matchId` con el equipo y marcadores elegidos.
2. **Actualización Local Inmediata:** Actualiza el estado en memoria sustituyendo cualquier voto anterior en ese partido mediante:
   ```typescript
   picks: [...current.picks.filter((p) => p.matchId !== matchId), pick]
   ```
3. **Disparo de Sincronización:** Incrementa `revision` inmediatamente (`setRevision((r) => r + 1)`), solicitando los datos oficiales consolidados del servidor.
4. **Manejo de Conflicto 409:** Si el servidor rechaza la petición porque la votación acaba de cerrarse (`response.status === 409`), el cliente captura el error y propaga el mensaje amigable:
   ```typescript
   'Las votaciones ya están cerradas.'
   ```

### 3.4 Jornada Actual Persistente (`currentRound`)
- **Almacenamiento por División:** El hook mantiene el estado interno `currentRound` estructurado como `{ divisionId, id: data.currentRound }`. Solo expone el identificador cuando la división activa coincide (`currentRound?.divisionId === divisionId ? (currentRound?.id ?? null) : null`).
- **Persistencia Durante la Carga de Otras Jornadas:** Al conmutar a una jornada anterior, `currentRound` se conserva en memoria mientras la nueva jornada solicitada carga en segundo plano. Esto previene parpadeos en los filtros de la interfaz (`RoundFilter`), garantizando que la lista de jornadas seleccionables permanezca estable sin perder la referencia a la jornada activa de la liga.
- **Sincronización Automática:** El valor se actualiza con cada respuesta del servidor (tanto en la carga inicial como en cada refresco del sondeo a 15 segundos). Gracias a esta sincronización continua, la jornada actual avanza por sí sola a las 00:00 UTC del lunes al entrar en vigor la siguiente semana deportiva, sin requerir recargar la página.

### 3.5 Generador de Rutas Auxiliar (`predictionsOverviewPath`)
```typescript
export function predictionsOverviewPath(divisionId: string, roundId?: string) {
  return roundId
    ? `divisions/${divisionId}?${new URLSearchParams({ roundId })}`
    : `divisions/${divisionId}`;
}
```
- Función pura exportada que compone la ruta de consulta del resumen de predicciones.
- Si se especifica `roundId`, anexa el parámetro de consulta serializado `?roundId=${roundId}` (`divisions/${divisionId}?roundId=${roundId}`).
- Si `roundId` se omite o es `undefined`, preserva la ruta base sin parámetros (`divisions/${divisionId}`), delegando en el backend la resolución automática de la jornada en curso de la división.
