# Lógica de Procesamiento y Algoritmos: Match Predictions

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General de la Lógica de Predicciones

La lógica de negocio del módulo de predicciones se encapsula de forma funcional y desacoplada en `prediction-policy.ts` (`apps/api/src/modules/predictions/prediction-policy.ts:1-33`). Sus responsabilidades abarcan:
1. El cálculo determinista de la semana natural deportiva bajo la zona horaria oficial de la competición (`Europe/Madrid`), con respeto estricto a los cambios de hora estacionales (DST).
2. La determinación del estado de la ventana de votación para cada enfrentamiento (`open` vs. `closed`).
3. El baremo plano de asignación de puntos por acierto de ganador y marcador exacto.
4. El cálculo de porcentajes enteros de la comunidad y la validación matemática de tanteos en series Best-Of.

---

## 2. Semana y plazo por partido

La semana comienza el lunes a las 00:00 en `Europe/Madrid`, respetando los cambios de horario. `leagueWeek` devuelve su identificador, sin una apertura global por día.

```typescript
// Calendar weeks use league time, including DST.
export function leagueWeek(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
  const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  return { week: day.toISOString().slice(0, 10) };
}

export function predictionWindow(scheduledAt: Date | null, status: string, now: Date) {
  const current = leagueWeek(now);
  const week = scheduledAt ? leagueWeek(scheduledAt).week : null;
  const closed =
    scheduledAt !== null &&
    (now.getTime() >= scheduledAt.getTime() - 60 * 60 * 1000 || status !== 'scheduled');
  return {
    open: week === current.week && status === 'scheduled' && scheduledAt !== null && !closed,
    closed
  };
}


```

## 3. Estados y publicación

`open` permite votar en partidos `scheduled` de la semana actual hasta una hora antes del inicio. Exactamente en ese límite el voto ya está cerrado. `closed` indica que un partido con fecha alcanzó el límite o dejó de estar `scheduled`; no autoriza publicar porcentajes.

| Situación | `open` | `closed` | Datos comunitarios |
|---|---|---|---|
| Programado esta semana, más de una hora antes | `true` | `false` | Ocultos |
| Programado, desde una hora antes | `false` | `true` | Ocultos |
| En directo | `false` | `true` | Ocultos |
| Finalizado (`completed` o `forfeit`), con fecha | `false` | `true` | Visibles |
| Programado para una semana futura | `false` | `false` | Ocultos |
| Sin fecha | `false` | `false` | Fuera del resumen semanal |

El `open` global indica que algún partido elegible admite votos. El resumen incluye solo encuentros de la semana actual y excluye los cancelados.

## 4. Privacidad y aplazamientos

El repositorio publica `votes` y `homePercent` únicamente en estado `completed` o `forfeit`. Ambos permanecen `null` durante la hora previa y las retransmisiones en directo. Al finalizar sin votos, `votes` es cero y `homePercent` sigue siendo `null`.

Retrasar un partido `scheduled` de las 18:00Z a las 21:00Z puede reabrir el voto a las 18:30Z dentro de la semana actual. Los porcentajes nunca se habían publicado, por lo que no se exponen tendencias. Cambiar la fecha de un partido finalizado no reabre el voto mientras conserve su estado final.

No se añade una excepción para el lunes entre las 00:00 y las 00:59: la competición no permite encuentros en lunes ni martes.

---

## 5. Baremo de Puntuación y Refutación de Cuotas

### 5.1 Baremo Plano de Puntos (`predictionPoints`)
La asignación de puntos se calcula en `prediction-policy.ts:30-32`:

```typescript
// apps/api/src/modules/predictions/prediction-policy.ts:30-32
export function predictionPoints(correctWinner: boolean, exactScore: boolean) {
  return correctWinner ? (exactScore ? 3 : 1) : 0;
}
```

- **Ganador Correcto + Marcador Exacto:** **3 puntos**.
- **Ganador Correcto + Marcador Diferente:** **1 punto**.
- **Ganador Incorrecto:** **0 puntos** (incluso si coincidió el número de mapas de alguno de los equipos).

### 5.2 Refutación de Cuotas de Apuesta (Odds)
- En el código fuente no existe ningún algoritmo de cuotas decimales, multiplicadores de ganancias, líneas de dinero ni cálculos de momios.
- Los porcentajes de la comunidad se calculan como un entero puro mediante redondeo estándar:
  ```typescript
  // predictions.repository.ts:67-71
  homePercent = Math.round((100 * homeVotes) / totalVotes);
  ```
- El porcentaje del equipo visitante es calculado por el cliente como `100 - homePercent`.

---

## 6. Validación de Marcadores en Formatos Best-Of (Bo1, Bo3, Bo5)

Cuando un usuario envía un pronóstico con tanteo (`homeScore` o `awayScore`), `predictions.repository.ts:113-120` valida que el marcador sea coherente con la longitud de la serie (`match.bestOf`):

```typescript
// predictions.repository.ts:113-120
const wins = Math.floor(match.bestOf / 2) + 1;
const winnerScore = home ? pick.homeScore : pick.awayScore;
const loserScore = home ? pick.awayScore : pick.homeScore;
if (
  (pick.homeScore !== null || pick.awayScore !== null) &&
  (winnerScore !== wins || loserScore === null || loserScore < 0 || loserScore >= wins)
)
  throw new AppError(400, 'INVALID_SCORE', 'Invalid series score.');
```

### Reglas por Formato:
1. **Victorias Requeridas:** `wins = Math.floor(bestOf / 2) + 1`.
   - Para **Bo1**: `wins = Math.floor(1 / 2) + 1 = 1`.
   - Para **Bo3**: `wins = Math.floor(3 / 2) + 1 = 2`.
   - Para **Bo5**: `wins = Math.floor(5 / 2) + 1 = 3`.
2. **Puntuación del Ganador:** El equipo seleccionado como vencedor debe recibir exactamente `wins` mapas ganados.
3. **Puntuación del Perdedor:** El equipo no seleccionado debe tener un tanteo no nulo, `>= 0` y estrictamente inferior a `wins` (`0 <= loserScore < wins`).
   - Combinaciones válidas en Bo1: `1-0`, `0-1`.
   - Combinaciones válidas en Bo3: `2-0`, `2-1`, `0-2`, `1-2`.
   - Combinaciones válidas en Bo5: `3-0`, `3-1`, `3-2`, `0-3`, `1-3`, `2-3`.
4. **Predicción sin Tanteo:** Si tanto `homeScore` como `awayScore` son `null`, el voto se acepta como pronóstico de "solo ganador", optando a 1 punto si acierta el vencedor.
