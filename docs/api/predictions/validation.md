# Validación y Manejo de Errores: Match Predictions

[⬅️ Volver a Persistencia](persistence.md) | [Siguiente: Contratos ➡️](contracts.md)

---

## 1. Visión General de Validación

El módulo de predicciones aplica validaciones en dos fases estrictamente diferenciadas:
1. **Validación Sintáctica HTTP (Zod Schemas):** En `predictions.router.ts`, se validan los identificadores de ruta y la estructura del cuerpo JSON de la solicitud con modificador `.strict()`.
2. **Validación Semántica y Deportiva (Repository Guard):** En `predictions.repository.ts`, se comprueban las reglas de integridad deportiva: ventana de votación activa, pertenencia del equipo a la serie y consistencia matemática del marcador según el formato Best-Of.

---

## 2. Esquemas de Validación Zod (`predictions.router.ts`)

### 2.1 Identificadores de Ruta (UUID)
- En `GET /divisions/:id` y `GET /divisions/:id/mine`:
  ```typescript
  z.string().uuid().parse(req.params.id)
  ```
  Si el parámetro de ruta no es un UUID v4 válido, la petición falla inmediatamente con **HTTP 422 `VALIDATION_ERROR`**.
- En `PUT /matches/:id`:
  ```typescript
  z.string().uuid().parse(req.params.id)
  ```

### 2.2 Cuerpo de Pronóstico (`PUT /matches/:id`)

```typescript
// apps/api/src/modules/predictions/predictions.router.ts:29-36
const pick = z
  .object({
    selectedTeamId: z.string().uuid(),
    homeScore: z.number().int().min(0).max(100).nullable(),
    awayScore: z.number().int().min(0).max(100).nullable()
  })
  .strict()
  .parse(req.body);
```

#### Reglas del Esquema:
- **`selectedTeamId`:** UUID obligatorio que identifica el equipo pronosticado como ganador de la serie.
- **`homeScore` y `awayScore`:** Números enteros comprendidos entre 0 y 100, o `null`. Admiten `null` explícito para permitir predicciones que únicamente pronostican el ganador sin arriesgar un marcador exacto.
- **`.strict()`:** Rechaza cualquier campo adicional suministrado en el cuerpo JSON (por ejemplo, intentos de inyectar `matchId`, `userId` o `points`), garantizando que los metadatos de auditoría y autoría provengan exclusivamente de la sesión verificada.

---

## 3. Validaciones de Dominio y Errores de Negocio

En `predictions.repository.ts:113-152`, se ejecutan las siguientes comprobaciones de negocio dentro de la transacción pesimista:

### 3.1 Comprobación de Equipos Activos (`INACTIVE_TEAMS`)
**Archivo**: `predictions.repository.ts:117-138`

```typescript
// apps/api/src/modules/predictions/predictions.repository.ts:125-138
if (
  !match.team1Id ||
  !match.team2Id ||
  ![match.team1Id, match.team2Id].every((id) =>
    participants.some(
      (team) => team.id === id && team.discordRoleId !== null && team.discordRoleId >= 0n
    )
  )
)
  throw new AppError(
    409,
    'INACTIVE_TEAMS',
    'Predictions are not allowed for matches with inactive or ghost teams.'
  );
```
- **Regla de Negocio**: Las predicciones solo están permitidas para partidos donde ambos contendientes son equipos activos (`discordRoleId !== null && discordRoleId >= 0n`).
- **Comportamiento ante Anomalías**: Si un partido involucra a un equipo retirado (sentinel `-10n`), un equipo fantasma (sentinel `-9000n`) o un equipo sin rol de Discord configurado (`null`), la transacción aborta y se rechaza la solicitud emitiendo un conflicto **HTTP 409 `INACTIVE_TEAMS`**.

### 3.2 Comprobación de Ventana de Votación (`PREDICTIONS_CLOSED`)
**Archivo**: `predictions.repository.ts:139-140`

```typescript
if (!predictionWindow(match.scheduledAt, match.status, new Date()).open)
  throw new AppError(409, 'PREDICTIONS_CLOSED', 'Voting is closed.');
```
- Se reevalúa el estado de la ventana en tiempo real con la fecha y hora exacta del servidor (`new Date()`).
- Si la fecha límite semanal expiró (martes 23:59:59) o el partido ya ha alcanzado su hora de inicio (`scheduledAt <= now`), el servidor arroja un conflicto **HTTP 409**.

### 3.3 Comprobación de Participación de Equipo (`INVALID_TEAM`)
**Archivo**: `predictions.repository.ts:141-143`

```typescript
const home = pick.selectedTeamId === match.team1Id;
if (!home && pick.selectedTeamId !== match.team2Id)
  throw new AppError(400, 'INVALID_TEAM', 'Choose a match participant.');
```
- El equipo elegido debe ser obligatoriamente el equipo local (`match.team1Id`) o el equipo visitante (`match.team2Id`). Si se envía un UUID perteneciente a otro equipo de la liga, se rechaza con **HTTP 400**.

### 3.4 Consistencia de Tanteo Best-Of (`INVALID_SCORE`)
**Archivo**: `predictions.repository.ts:144-151`

```typescript
const wins = Math.floor(match.bestOf / 2) + 1;
const winnerScore = home ? pick.homeScore : pick.awayScore;
const loserScore = home ? pick.awayScore : pick.homeScore;
if (
  (pick.homeScore !== null || pick.awayScore !== null) &&
  (winnerScore !== wins || loserScore === null || loserScore < 0 || loserScore >= wins)
)
  throw new AppError(400, 'INVALID_SCORE', 'Invalid series score.');
```
- Si se proporciona al menos uno de los dos tanteos (`homeScore !== null || awayScore !== null`):
  1. Ambos tanteos deben estar definidos (ninguno puede ser `null`).
  2. El tanteo del equipo seleccionado como ganador debe ser **exactamente igual** a las victorias requeridas (`wins = Math.floor(bestOf / 2) + 1`).
  3. El tanteo del equipo perdedor debe ser un entero no negativo menor estricto que `wins` (`0 <= loserScore < wins`).
- En caso de discordancia, arroja **HTTP 400 `INVALID_SCORE`**.

---

## 4. Catálogo Canónico de Errores

| Código HTTP | Código Interno | Causa Técnica | Ubicación |
|:---:|---|---|---|
| **`400 Bad Request`** | `INVALID_TEAM` | El equipo seleccionado no es participante en el partido. | `predictions.repository.ts:143` |
| **`400 Bad Request`** | `INVALID_SCORE` | Marcador inconsistente con el formato Best-Of del partido. | `predictions.repository.ts:151` |
| **`401 Unauthorized`** | `UNAUTHORIZED` | Petición a `/mine` o `PUT /matches/:id` sin sesión de Discord. | `auth.router.ts:25` |
| **`403 Forbidden`** | `FORBIDDEN` | Cabecera `Origin` discordante con `frontendOrigin` en mutación. | `auth.router.ts:35` |
| **`404 Not Found`** | `NOT_FOUND` | La división (`notFound('Division')`) o el partido (`notFound('Match')`) no existen. | `predictions.repository.ts:18, 119` |
| **`409 Conflict`** | `INACTIVE_TEAMS` | Predicciones no permitidas en encuentros con equipos inactivos o fantasma. | `predictions.repository.ts:133-138` |
| **`409 Conflict`** | `PREDICTIONS_CLOSED` | El plazo de votación cerró o el partido ya comenzó (`scheduledAt <= now`). | `predictions.repository.ts:140` |
| **`422 Unprocessable Entity`** | `VALIDATION_ERROR` | Parámetro UUID inválido en ruta o propiedades extra en cuerpo JSON. | `predictions.router.ts:13, 36, 39` |
| **`500 Internal Server Error`** | `INTERNAL_SERVER_ERROR` | Fallo de base de datos o excepción no controlada en runtime. | Manejador global Express |
