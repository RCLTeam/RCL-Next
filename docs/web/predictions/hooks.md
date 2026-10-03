# Hooks Headless y Sincronización: Match Predictions

[⬅️ Volver a Componentes](components.md) | [Siguiente: Páginas ➡️](pages.md)

---

## 1. Visión General de la Sincronización

La comunicación de red, la reactividad y la gestión de votos en cliente residen de forma desacoplada en el hook headless `usePredictions` (`apps/web/src/features/predictions/usePredictions.ts:1-73`).

Este hook resuelve tres requisitos críticos:
1. Recuperación atómica y paralela del resumen público de la división y de los votos personales del usuario mediante `Promise.all`.
2. Sondeo en segundo plano (*polling*) cada 15 segundos para sincronizar el estado de la ventana de votación según la hora del servidor y actualizar los porcentajes al finalizar cada partido.
3. Mutación optimista inmediata al guardar un pronóstico, reflejando el voto en pantalla antes de que concluya el viaje de ida y vuelta a la red.

---

## 2. Implementación de `usePredictions`

```typescript
// apps/web/src/features/predictions/usePredictions.ts:17-72
export function usePredictions(divisionId: string | undefined, userId: string | undefined) {
  const [result, setResult] = useState<{
    key: string;
    data: PredictionsData;
    picks: PredictionPick[];
  } | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const key = `${divisionId}/${userId}`;

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
```

---

## 3. Mecanismos de Ingeniería del Hook

### 3.1 Consulta Paralela y Cancelación con `AbortController`
- Cuando la división cambia o se incrementa la revisión, se instancia un nuevo `AbortController`.
- Se ejecutan en paralelo:
  1. `divisions/${divisionId}`: Datos públicos de la jornada y clasificación de la temporada.
  2. `divisions/${divisionId}/mine`: Votos personales del usuario autenticado (o `Promise.resolve([])` si el usuario navega de forma anónima).
- Al desmontar el componente o reiniciarse el efecto, `controller.abort()` cancela ambas peticiones en vuelo, evitando fugas de memoria y respuestas obsoletas.

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
