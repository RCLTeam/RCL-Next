# Contratos de Interfaz y Tipos Compartidos: Match Predictions

[⬅️ Volver a Validación](validation.md) | [Volver al Índice de API Predictions ⬆️](README.md)

---

## 1. Visión General de Contratos

Los tipos de datos e interfaces que rigen el sistema de predicciones residen en el paquete compartido `@rcl/contracts` (`packages/contracts/src/predictions.ts`).

Estos contratos definen la estructura inmutable de los pronósticos emitidos por los usuarios, el resumen de estado de cada encuentro en la jornada, y las entradas de la tabla de clasificación general de predictores.

---

## 2. Definiciones de Tipos TypeScript (`packages/contracts/src/predictions.ts`)

```typescript
// packages/contracts/src/predictions.ts
export interface PredictionPick {
  matchId: string;
  selectedTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface PredictionSummary {
  matchId: string;
  open: boolean;
  closed: boolean;
  homePercent: number | null;
  votes: number | null;
}

export interface PredictorStanding {
  userId: string;
  name: string;
  avatarHash: string | null;
  position: number;
  correct: number;
  total: number;
  points: number;
}

export interface PredictionsData {
  week: string;
  /** Round whose matches are listed; null when the division has no started round. */
  round: string | null;
  /** Latest round whose league week has started. */
  currentRound: string | null;
  open: boolean;
  matches: PredictionSummary[];
  ranking: PredictorStanding[];
}
```

---

## 3. Desglose Detallado de Interfaces

### 3.1 `PredictionPick`
Representa el pronóstico emitido por un usuario individual para un enfrentamiento:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|:---:|---|
| `matchId` | `string` (UUID) | Sí | Identificador del partido pronosticado (`matches.id`). |
| `selectedTeamId` | `string` (UUID) | Sí | Identificador del equipo que el usuario pronostica como ganador (`teams.id`). |
| `homeScore` | `number \| null` | Sí | Número de mapas asignados al equipo local, o `null` si no pronostica tanteo. |
| `awayScore` | `number \| null` | Sí | Número de mapas asignados al equipo visitante, o `null` si no pronostica tanteo. |

---

### 3.2 `PredictionSummary`
Representa el estado público de la ventana y el escrutinio comunitario de un partido:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|:---:|---|
| `matchId` | `string` (UUID) | Sí | Identificador del partido. |
| `open` | `boolean` | Sí | Indica si la votación para este partido está actualmente abierta. Solo verdadero para partidos `scheduled` de la semana actual a más de una hora del inicio. |
| `closed` | `boolean` | Sí | Indica si un partido con fecha alcanzó el límite de una hora antes o dejó de estar `scheduled`. No determina la publicación de votos. |
| `homePercent` | `number \| null` | Sí | Porcentaje entero de votos favorables al equipo local (`0` a `100`). Devuelve `null` hasta que el partido esté `completed` o `forfeit`. |
| `votes` | `number \| null` | Sí | Número total de votos comunitarios emitidos para el partido. Devuelve `null` hasta que el partido esté `completed` o `forfeit`. |

---

### 3.3 `PredictorStanding`
Entrada individual en la tabla de clasificación de la temporada:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|:---:|---|
| `userId` | `string` | Sí | Identificador Discord del usuario (`discord_users.discordId`). |
| `name` | `string` | Sí | Nombre global de Discord (`globalName`) o nombre de usuario (`username`). |
| `avatarHash` | `string \| null` | Sí | Hash del avatar de Discord, sin extensión; puede llevar el prefijo `a_` para avatares animados. `null` si el usuario no tiene avatar. Se combina con `userId` para solicitar la imagen al proxy `/api/v1/discord-avatars/:discordId/:hash`. |
| `position` | `number` | Sí | Posición secuencial en la tabla (1-indexed). |
| `correct` | `number` | Sí | Número total de enfrentamientos en los que acertó el equipo ganador. |
| `total` | `number` | Sí | Número total de partidos pronosticados por el usuario. |
| `points` | `number` | Sí | Puntuación total acumulada según el baremo oficial (3/1/0 puntos). |

#### Criterio de Ordenación del Ranking (`predictions.repository.ts`, método `overview`):
1. **Puntos Descendente:** `b.points - a.points`
2. **Aciertos Descendente:** `b.correct - a.correct`
3. **Nombre Alfabético Ascendente:** `a.name.localeCompare(b.name)`
4. **Discord ID Ascendente:** `a.userId.localeCompare(b.userId)`

---

### 3.4 `PredictionsData`
Estructura global entregada por el endpoint público `GET /api/v1/predictions/divisions/:id`:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|:---:|---|
| `week` | `string` | Sí | Fecha ISO del lunes de la semana actual de la consulta (`YYYY-MM-DD`, ej. `'2026-09-28'`). |
| `round` | `string \| null` | Sí | Jornada cuyos partidos se listan, o `null` si la división aún no tiene ninguna jornada iniciada. |
| `currentRound` | `string \| null` | Sí | Última jornada cuya semana de Madrid ha empezado. |
| `open` | `boolean` | Sí | Verdadero si algún partido elegible de la división admite votos. Abarca todos los partidos de la división, no solo los de la jornada mostrada. |
| `matches` | `PredictionSummary[]` | Sí | Lista de resúmenes de partidos de la jornada con su estado de votación. |
| `ranking` | `PredictorStanding[]` | Sí | Clasificación acumulada de todos los pronosticadores de la temporada. |

> **Aclaración sobre `week` y `open`:**
> - El campo `week` sigue siendo la semana de la fecha de consulta (independientemente de qué jornada se esté visualizando en `round`).
> - El campo `open` abarca todos los partidos de la división, no solo los de la jornada mostrada en `matches`.

---

## 4. Ejemplos de Cargas Útiles JSON

### 4.1 Consulta de Resumen Público (`GET /api/v1/predictions/divisions/:id`)

#### Respuesta (HTTP 200 - Durante Ventana Abierta):
```json
{
  "data": {
    "week": "2026-09-28",
    "round": "5",
    "currentRound": "5",
    "open": true,
    "matches": [
      {
        "matchId": "d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a",
        "open": true,
        "closed": false,
        "homePercent": null,
        "votes": null
      }
    ],
    "ranking": [
      {
        "userId": "123456789012345678",
        "name": "Knekro",
        "avatarHash": "0123456789abcdef0123456789abcdef",
        "position": 1,
        "correct": 14,
        "total": 16,
        "points": 38
      }
    ]
  }
}
```

#### Respuesta (HTTP 200 - Tras Finalizar el Partido):
```json
{
  "data": {
    "week": "2026-09-28",
    "round": "5",
    "currentRound": "5",
    "open": false,
    "matches": [
      {
        "matchId": "d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a",
        "open": false,
        "closed": true,
        "homePercent": 67,
        "votes": 142
      }
    ],
    "ranking": [
      {
        "userId": "123456789012345678",
        "name": "Knekro",
        "avatarHash": "0123456789abcdef0123456789abcdef",
        "position": 1,
        "correct": 14,
        "total": 16,
        "points": 38
      }
    ]
  }
}
```

### 4.2 Guardar Pronóstico (`PUT /api/v1/predictions/matches/:id`)

#### Solicitud:
```json
{
  "selectedTeamId": "e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b",
  "homeScore": 2,
  "awayScore": 1
}
```

#### Respuesta (HTTP 200):
```json
{
  "data": null
}
```
