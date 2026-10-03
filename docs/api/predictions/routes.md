# Rutas HTTP: Match Predictions & Community Leaderboard

[⬅️ Volver a API Predictions](README.md) | [Siguiente: Procesamiento ➡️](processing.md)

---

## 1. Visión General y Montaje del Enrutador

El enrutador del módulo de predicciones se define mediante la función constructora `predictionsRouter(repository, auth)` en `apps/api/src/modules/predictions/predictions.router.ts`. Se monta en el pipeline principal de Express (`apps/api/src/app.ts`) bajo el prefijo canónico `/api/v1/predictions`:

```typescript
// apps/api/src/app.ts
if (options.predictionsRepository)
  app.use('/api/v1/predictions', predictionsRouter(options.predictionsRepository, options.auth));
```

### Cabecera Global Anti-Caché
Todas las solicitudes que atraviesan este enrutador reciben automáticamente el encabezado HTTP:
```http
Cache-Control: no-store
```
Esto asegura que ni el estado de la ventana de votación, ni los votos personales del usuario ni los porcentajes comunitarios recién revelados queden retenidos en la caché del navegador o intermediarios (`predictions.router.ts`).

---

## 2. Catálogo Canónico de Endpoints

A continuación se detalla la matriz completa de las 3 rutas gestionadas por el módulo:

| # | Método | Ruta Relativa | Acceso / Autenticación | Controlador Delegado | Ubicación en Router |
|:---:|:---:|---|---|---|---|
| 1 | `GET` | `/divisions/:id` (parámetro opcional `?roundId=`) | Público | `repository.overview(divisionId, options)` | `predictions.router.ts` |
| 2 | `GET` | `/divisions/:id/mine` | Autenticado (`requireAuth`) | `repository.mine(divisionId, userId)` | `predictions.router.ts` |
| 3 | `PUT` | `/matches/:id` | Autenticado + Trusted Origin | `repository.save(userId, pick)` | `predictions.router.ts` |

---

## 3. Especificación Detallada por Endpoint

### 3.1 `GET /api/v1/predictions/divisions/:id`
- **Propósito**: Proporciona el resumen general de predicciones para una división deportiva: identifica la semana actual, la jornada listada (`round`), la última jornada iniciada (`currentRound`), el estado global de la ventana semanal (`open`), la lista de partidos programados con su ventana individual y el ranking acumulado de toda la temporada.
- **Parámetros de Ruta**:
  - `id` (`string`, requerido): Identificador UUID de la división (`seasons_divisions.id`). Validado con `z.string().uuid()` en `predictions.router.ts`.

#### Parámetros de Consulta
| Parámetro | Tipo | Requerido | Descripción |
|---|---|:---:|---|
| `roundId` | Entero (`int16`, `-32768` a `32767`) | No (opcional) | Identificador de `rounds` en la división. Si se omite, se usa la jornada actual (`currentRoundId`). |

- **Implementación del Handler**:
```typescript
  router.get('/divisions/:id', async (req, res) => {
    const divisionId = z.string().uuid().parse(req.params.id);
    const { roundId } = overviewQuery.parse(req.query);
    res.json({
      data: await repository.overview(divisionId, roundId === undefined ? {} : { roundId })
    });
  });
```

- **Comportamiento Específico**:
  - Si el parámetro `roundId` se especifica, se listan los partidos correspondientes a dicha jornada (`matches.id_round = roundId`).
  - Si se omite `roundId`, se listan los partidos de la jornada actual determinada por `currentRoundId` (o `null` si ninguna jornada ha iniciado).
  - Si el partido no está finalizado (`completed` o `forfeit`), las propiedades `votes` y `homePercent` del resumen devuelven estrictamente `null` (`predictions.repository.ts`, método `overview`).
  - Únicamente cuando el partido está `completed` o `forfeit` se revela el número de votos comunitarios y el porcentaje de victoria asignado al equipo local.
- **Errores**:
  - **HTTP 404 `NOT_FOUND`**: la jornada no pertenece a la división (`notFound('Round')`) o la división especificada no existe en la base de datos (`notFound('Division')`).
  - **HTTP 422 `VALIDATION_ERROR`**: valor no entero, fuera de rango (`-32768` a `32767`), repetido o parámetro desconocido en la consulta (rechazado por `.strict()`), así como UUID inválido en ruta.
- **Respuesta**: HTTP 200 `{ "data": PredictionsData }`.

---

### 3.2 `GET /api/v1/predictions/divisions/:id/mine`
- **Propósito**: Devuelve la lista de predicciones que el usuario autenticado ha emitido para los partidos pertenecientes a la división solicitada.
- **Autenticación**: Custodiado por `requireAuth(auth)` (`predictions.router.ts`). Si el usuario no ha iniciado sesión mediante Discord o su cookie de sesión ha expirado, arroja **HTTP 401**.
- **Parámetros de Ruta**:
  - `id` (`string`, requerido): UUID de la división (`seasons_divisions.id`).
- **Mecanismo**: Consulta la tabla `predictions` uniendo con `matches` filtrando por `matches.idSeasonDivision = divisionId` y `predictions.discordUserId = userId` (`predictions.repository.ts`, método `mine`).
- **Respuesta**: HTTP 200 `{ "data": PredictionPick[] }`. Si el usuario no ha votado en ningún partido de la división, devuelve un array vacío `[]`.

---

### 3.3 `PUT /api/v1/predictions/matches/:id`
- **Propósito**: Registra o actualiza el pronóstico del usuario para un enfrentamiento específico.
- **Autenticación y Seguridad**:
  - Exige sesión autenticada (`requireAuth(auth)`).
  - Exige que la cabecera `Origin` coincida con la URL autorizada del frontend (`requireTrustedOrigin(auth.frontendOrigin)`, `predictions.router.ts`).
- **Parámetros de Ruta**:
  - `id` (`string`, requerido): UUID del partido (`matches.id`). Validado con `z.string().uuid()`.
- **Cuerpo de la Solicitud (JSON)**:
  ```typescript
  // predictions.router.ts
  z.object({
    selectedTeamId: z.string().uuid(),
    homeScore: z.number().int().min(0).max(100).nullable(),
    awayScore: z.number().int().min(0).max(100).nullable()
  }).strict()
  ```
- **Validaciones de Negocio Fail-Fast**:
  1. Si la ventana de votación del partido ya no está abierta (`!window.open`), rechaza la petición con **HTTP 409 `PREDICTIONS_CLOSED`** (`predictions.repository.ts`, método `save`).
  2. Si `selectedTeamId` no coincide ni con el equipo local (`team1Id`) ni con el visitante (`team2Id`), arroja **HTTP 400 `INVALID_TEAM`** (`predictions.repository.ts`, método `save`).
  3. Si se envían marcadores (`homeScore` o `awayScore`), se verifica que el ganador tenga exactamente las victorias requeridas por el formato Best-Of (`wins = Math.floor(bestOf / 2) + 1`) y que el perdedor tenga un marcador `>= 0` y estrictamente menor que `wins`. De lo contrario, arroja **HTTP 400 `INVALID_SCORE`** (`predictions.repository.ts`, método `save`).
- **Respuesta**: HTTP 200 `{ "data": null }`.

---

## 4. Matriz de Códigos de Estado HTTP

| Código | Causa Técnica | Estructura de Respuesta |
|:---:|---|---|
| **`200 OK`** | Consulta de resumen de división, consulta de votos propios o voto registrado con éxito. | `{"data": ...}` |
| **`400 Bad Request`** | Parámetros inválidos en el cuerpo: el equipo seleccionado no participa en el partido (`INVALID_TEAM`) o el tanteo de serie no es coherente con el formato Best-Of (`INVALID_SCORE`). | `{"error": "INVALID_TEAM" \| "INVALID_SCORE", "message": "..."}` |
| **`401 Unauthorized`** | Petición a `/mine` o `PUT /matches/:id` sin sesión activa de Discord (`requireAuth`). | `{"error": "UNAUTHORIZED", "message": "Authentication required."}` |
| **`403 Forbidden`** | La cabecera `Origin` en `PUT /matches/:id` no coincide con el origen seguro del frontend (`requireTrustedOrigin`). | `{"error": "FORBIDDEN", "message": "Forbidden."}` |
| **`404 Not Found`** | La división o el partido consultado no existe en la base de datos (`notFound`), o la jornada no pertenece a la división (`notFound('Round')`). | `{"error": "NOT_FOUND", "message": "<Resource> not found"}` |
| **`409 Conflict`** | El plazo de votación para el partido ya ha expirado o el partido ya ha comenzado (`PREDICTIONS_CLOSED`). | `{"error": "PREDICTIONS_CLOSED", "message": "Voting is closed."}` |
| **`422 Unprocessable Entity`** | Error en la validación Zod de identificadores UUID en ruta, valor no entero, fuera de rango, repetido o parámetro desconocido en `overviewQuery`, o campos adicionales en el cuerpo rechazados por `.strict()`. | `{"error": "VALIDATION_ERROR", "details": [...]}` |
| **`500 Internal Server Error`** | Error no controlado en la ejecución de consultas Drizzle o en la base de datos PostgreSQL. | `{"error": "INTERNAL_SERVER_ERROR", "message": "..."}` |
