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

## 2. Política Temporal y Zona Horaria Oficial (`leagueWeek`)

La liga Rebel Crown Legacy se disputa en territorio español y rige sus plazos por la hora peninsular española. Para evitar desfases causados por servidores alojados en zonas horarias UTC u otras regiones geográficas, la función `leagueWeek` calcula la semana calendario mediante el formateador internacional `Intl.DateTimeFormat`:

```typescript
// apps/api/src/modules/predictions/prediction-policy.ts:2-14
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
  return { week: day.toISOString().slice(0, 10), open: weekday < 2 };
}
```

### Reglas Matemáticas del Calendario:
1. **Desplazamiento al Lunes:** La fórmula `weekday = (day.getUTCDay() + 6) % 7` convierte la numeración estándar de JavaScript (donde el domingo es 0) a una escala donde el **lunes es 0**, el martes es 1, y el domingo es 6.
2. **Identificador de Semana (`week`):** Al restar `weekday` días a la fecha en UTC (`day.setUTCDate(day.getUTCDate() - weekday)`), se obtiene la fecha del lunes correspondiente a esa semana en formato ISO `YYYY-MM-DD` (ej. `'2026-09-28'`).
3. **Plazo Semanal de Votación (`open: weekday < 2`):**
   - **Lunes (`weekday = 0`):** `open = true`.
   - **Martes (`weekday = 1`):** `open = true`.
   - **Miércoles a Domingo (`weekday >= 2`):** `open = false`.
   - El plazo semanal finaliza exactamente el **martes a las 23:59:59** hora de Madrid. A las 00:00:00 del miércoles, `open` pasa a ser `false`.

---

## 3. Máquina de Estados de la Ventana de Predicción (`predictionWindow`)

Cada enfrentamiento programado posee su propia ventana de predicción evaluada en tiempo real mediante `predictionWindow` (`prediction-policy.ts:16-28`):

```typescript
// apps/api/src/modules/predictions/prediction-policy.ts:16-28
export function predictionWindow(scheduledAt: Date | null, status: string, now: Date) {
  const current = leagueWeek(now);
  const week = scheduledAt ? leagueWeek(scheduledAt).week : null;
  return {
    open:
      week === current.week &&
      current.open &&
      status === 'scheduled' &&
      scheduledAt !== null &&
      scheduledAt > now,
    closed: week !== null && (week < current.week || (week === current.week && !current.open))
  };
}
```

### Matriz de Estados de la Ventana

| Condición Temporal | `status` | `open` | `closed` | Comportamiento en la Plataforma |
|---|:---:|:---:|:---:|---|
| Lunes/Martes y `now < scheduledAt` | `'scheduled'` | `true` | `false` | **Votación abierta.** Los usuarios pueden votar y editar sus predicciones. Los porcentajes de la comunidad están ocultos (`null`). |
| Martes tarde y `now >= scheduledAt` | `'scheduled'` o `'live'` | `false` | `false` | **Ventana intermedia del Kickoff.** Votación bloqueada para este partido. Los porcentajes comunitarios **continúan ocultos** (`null`). |
| Miércoles a Domingo | Cualquiera | `false` | `true` | **Votación cerrada.** Plazo semanal expirado. Se revelan el recuento total de votos (`votes`) y el porcentaje comunitario (`homePercent`). |
| Semana pasada (`week < current.week`) | Cualquiera | `false` | `true` | **Semana histórica.** Resultados cerrados y visibles. |

---

## 4. Autopsia de la Ventana Intermedia del Kickoff

### Comportamiento de la Ventana Intermedia del Kickoff
- **Delimitación de Estados:** Podría suponerse que una predicción solo puede encontrarse en dos estados binarios: o está abierta para votar, o está cerrada y se desvelan los porcentajes de la comunidad.
- **Realidad en el código:** Cuando un partido comienza un martes por la tarde (por ejemplo, a las 18:00 hora de Madrid) y son las 18:05:
  1. `scheduledAt > now` es `false`, por lo que **`open = false`** (`predictionWindow`, línea 25). Nadie puede enviar un voto para ese partido (`PUT /matches/:id` rechazará con HTTP 409).
  2. Sin embargo, para la propiedad `closed`, la condición `week === current.week && !current.open` evalúa a **`false`**, dado que para la semana global del martes `current.open` sigue siendo `true` hasta las 23:59:59.
  3. Por tanto, **`closed = false`**.
  4. En `predictions.repository.ts:64, 66`:
     ```typescript
     votes: window.closed ? picks.length : null,
     homePercent: window.closed && picks.length ? ... : null
     ```
  5. Dado que `window.closed` es `false`, tanto `votes` como `homePercent` se devuelven como **`null`**.
- **Propósito Deportivo:** Este comportamiento protege deliberadamente la confidencialidad de los votos durante las transmisiones en vivo del martes por la tarde, impidiendo que el público o los casters conozcan los porcentajes comunitarios hasta que la jornada completa haya concluido formalmente a medianoche.

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
