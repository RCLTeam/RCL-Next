# Rutas HTTP del Motor de Competición

[⬅️ Volver a API Competition](README.md) | [Siguiente: Procesamiento ➡️](processing.md)

---

## 1. Visión General y Montaje del Enrutador

El enrutador del motor de competición se define mediante la función constructora `competitionRouter(controller: CompetitionController)` en `apps/api/src/modules/competition/competition.router.ts:1-20`. Se monta en el pipeline principal de la aplicación (`apps/api/src/app.ts:163-166`) bajo el prefijo global `/api/v1`:

```typescript
// apps/api/src/app.ts:163-166
app.use('/api/v1', competitionRouter(competitionController));
```

Todos los endpoints exponen métodos `GET` idempotentes y no modificadores. Cada respuesta JSON encapsula la carga útil en la propiedad raíz `data` (`{ "data": ... }`).

---

## 2. Catálogo Canónico de los 12 Endpoints

A continuación se detalla la matriz completa de las 12 rutas registradas en `competition.router.ts:6-17`:

| # | Método | Ruta Relativa | Controlador Delegado | Ubicación en Router |
|:---:|:---:|---|---|---|
| 1 | `GET` | `/matches/:matchId` | `controller.matchDetail` | `competition.router.ts:6` |
| 2 | `GET` | `/players` | `controller.players` | `competition.router.ts:7` |
| 3 | `GET` | `/players/:playerId` | `controller.playerDetail` | `competition.router.ts:8` |
| 4 | `GET` | `/teams/:teamId` | `controller.teamDetail` | `competition.router.ts:9` |
| 5 | `GET` | `/seasons` | `controller.seasons` | `competition.router.ts:10` |
| 6 | `GET` | `/seasons/:seasonId/divisions` | `controller.divisions` | `competition.router.ts:11` |
| 7 | `GET` | `/divisions/:divisionId/teams` | `controller.teams` | `competition.router.ts:12` |
| 8 | `GET` | `/divisions/:divisionId/players` | `controller.players` | `competition.router.ts:13` |
| 9 | `GET` | `/divisions/:divisionId/rounds` | `controller.rounds` | `competition.router.ts:14` |
| 10 | `GET` | `/divisions/:divisionId/calendar` | `controller.calendar` | `competition.router.ts:15` |
| 11 | `GET` | `/divisions/:divisionId/champions` | `controller.champions` | `competition.router.ts:16` |
| 12 | `GET` | `/divisions/:divisionId/standings` | `controller.standings` | `competition.router.ts:17` |

---

## 3. Especificación Detallada por Endpoint

### 3.1 `GET /api/v1/matches/:matchId`
- **Propósito**: Obtiene el detalle técnico y estadístico de una serie de partidos al mejor de 3 (BO3), incluyendo mapas, composiciones, runas, objetos y MVP de la serie.
- **Parámetros de Ruta**:
  - `matchId` (`string`, requerido): Identificador UUID del partido o slug determinista (ej. `los-chicos-vs-team-rebel-jornada-1`). Validado con regex unicode: `z.string().min(1).max(400).regex(/^[\p{L}\p{N}-]+$/u)` (`competition.controller.ts:10-15`).
- **Comportamiento Específico**:
  - Si el partido existe pero su estado es `'scheduled'`, `'live'` o `'cancelled'`, el servicio arroja deliberadamente un error `notFound('Match')` -> **HTTP 404** (`competition.service.ts:77-78`). Únicamente se exponen enfrentamientos finalizados (`'completed'` o `'forfeit'`).
- **Respuesta**: HTTP 200 `{ data: MatchDetail }`.

### 3.2 `GET /api/v1/players`
- **Propósito**: Devuelve el censo global de todos los jugadores registrados en el sistema, ordenados alfabéticamente por `gameName`, `riotTag` e `id` (`postgres-competition.repository.ts:158`).
- **Parámetros**: Ninguno.
- **Respuesta**: HTTP 200 `{ data: Player[] }`.

### 3.3 `GET /api/v1/players/:playerId`
- **Propósito**: Obtiene la ficha consolidada de un jugador, sus cuentas vinculadas y su historial completo de equipos y divisiones disputadas ordenadas cronológicamente (`postgres-competition.repository.ts:314-319`).
- **Parámetros de Ruta**:
  - `playerId` (`string`, requerido): UUID del jugador o slug alfanumérico normalizado (`competition.controller.ts:28-33`).
- **Respuesta**: HTTP 200 `{ data: PlayerDetail }`. Si no se localiza -> HTTP 404.

### 3.4 `GET /api/v1/teams/:teamId`
- **Propósito**: Devuelve el perfil completo de un equipo, incluyendo miembros de la plantilla, roles (`top`, `jungle`, `mid`, `adc`, `support`, `coach`, `staff`), capitanía y estadísticas agregadas por miembro (`rosterStats`: partidas, MVPs, variedad de campeones, `competition.service.ts:167-181`).
- **Parámetros de Ruta**:
  - `teamId` (`string`, requerido): UUID del equipo o slug de equipo (`competition.controller.ts:40-45`).
- **Respuesta**: HTTP 200 `{ data: TeamDetail }`. Si no se localiza -> HTTP 404.

### 3.5 `GET /api/v1/seasons`
- **Propósito**: Lista todas las temporadas registradas, ordenadas por fecha de inicio descendente (`sql\`${seasons.startsOn} DESC NULLS LAST\``, `postgres-competition.repository.ts:369`).
- **Parámetros**: Ninguno.
- **Respuesta**: HTTP 200 `{ data: Season[] }`.

### 3.6 `GET /api/v1/seasons/:seasonId/divisions`
- **Propósito**: Devuelve las divisiones asociadas a una temporada concreta (ej. Premier, Segunda).
- **Parámetros de Ruta**:
  - `seasonId` (`string`, requerido): Nombre canónico de la temporada (validado con `z.string().min(1).max(120)`, `competition.controller.ts:54`).
- **Comportamiento**: Si la temporada no existe en la base de datos, arroja `notFound('Season')` -> HTTP 404 (`competition.service.ts:188`).
- **Respuesta**: HTTP 200 `{ data: Division[] }`.

### 3.7 `GET /api/v1/divisions/:divisionId/teams`
- **Propósito**: Lista los equipos inscritos en una división específica (`seasons_divisions.id`), ordenados alfabéticamente por nombre (`postgres-competition.repository.ts:418`).
- **Parámetros de Ruta**:
  - `divisionId` (`string`, requerido): UUID canónico validado con `z.string().uuid()` (`competition.controller.ts:58`). Formatos no UUID provocan HTTP 422.
- **Respuesta**: HTTP 200 `{ data: Team[] }`.

### 3.8 `GET /api/v1/divisions/:divisionId/players`
- **Propósito**: Devuelve los jugadores que forman parte de la división, enriquecidos con sus estadísticas de temporada acumuladas, campeón más utilizado y el jugador MVP destacado de la jornada más reciente (`postgres-competition.repository.ts:160-285`).
- **Parámetros de Ruta**:
  - `divisionId` (`string`, requerido): UUID canónico (`z.string().uuid()`).
- **Respuesta**: HTTP 200 `{ data: Player[] }`.

### 3.9 `GET /api/v1/divisions/:divisionId/rounds`
- **Propósito**: Devuelve las jornadas deportivas programadas para una división, proyectando su número de secuencia, fase (`stage`, ej. `'regular'`, `'playoff'`) y fechas.
- **Parámetros de Ruta**:
  - `divisionId` (`string`, requerido): UUID canónico (`z.string().uuid()`).
- **Respuesta**: HTTP 200 `{ data: Round[] }`.

### 3.10 `GET /api/v1/divisions/:divisionId/calendar`
- **Propósito**: Consulta el calendario de partidos de la división, con soporte de filtrado opcional por jornada.
- **Parámetros de Ruta**:
  - `divisionId` (`string`, requerido): UUID canónico (`z.string().uuid()`).
- **Parámetros de Consulta (Query String)**:
  - `roundId` (`string`, opcional): Identificador numérico de jornada. Validado estrictamente mediante `z.string().regex(/^-?\d+$/).refine(v => Number(v) >= -32768 && Number(v) <= 32767)` (`competition.controller.ts:67-71`).
  - **Validación Estricta**: La consulta aplica `.strict()` (`competition.controller.ts:73`). Si el cliente suministra claves de consulta inesperadas (ej. `?unexpected=1`), la petición es rechazada de inmediato con HTTP 422.
- **Comportamiento**: Si se proporciona un `roundId` numérico que no corresponde a ninguna jornada de la división, arroja `notFound('Round')` -> HTTP 404 (`competition.service.ts:210`).
- **Respuesta**: HTTP 200 `{ data: Match[] }`.

### 3.11 `GET /api/v1/divisions/:divisionId/champions`
- **Propósito**: Devuelve la agregación de estadísticas de todos los campeones seleccionados en mapas válidos y finalizados de la división (partidas disputadas, victorias, derrotas, tasa de selección y porcentaje de victoria).
- **Parámetros de Ruta**:
  - `divisionId` (`string`, requerido): UUID canónico (`z.string().uuid()`).
- **Respuesta**: HTTP 200 `{ data: ChampionStats[] }`.

### 3.12 `GET /api/v1/divisions/:divisionId/standings`
- **Propósito**: Calcula y entrega la tabla de clasificación en tiempo real para los equipos de la división.
- **Parámetros de Ruta**:
  - `divisionId` (`string`, requerido): UUID canónico (`z.string().uuid()`).
- **Parámetros de Consulta (Query String)**:
  - `stage` (`string`, opcional, por defecto `'regular'`): Fase del torneo a clasificar (validado con `z.string().trim().min(1).max(64)`, `competition.controller.ts:85`).
  - **Validación Estricta**: Aplica `.strict()` (`competition.controller.ts:86`). Cualquier parámetro adicional devuelve HTTP 422.
- **Respuesta**: HTTP 200 `{ data: Standing[] }`.

---

## 4. Matriz de Códigos de Estado HTTP

| Código HTTP | Causa Técnica | Estructura de Respuesta |
|---|---|---|
| **`200 OK`** | Petición procesada con éxito y recurso serializado. | `{"data": ...}` |
| **`404 Not Found`** | Recurso no encontrado (temporada, división, jornada, equipo, jugador o partido inexistente), o partido no finalizado (`competition.service.ts:77-78, 124, 188, 192, 210`). | `{"error": "NOT_FOUND", "message": "<Resource> not found"}` |
| **`422 Unprocessable Entity`** | Error de validación Zod en parámetros de ruta (UUID inválido, regex slug inválida) o en query string (claves extra no permitidas por `.strict()`, rango numérico excedido). | `{"error": "VALIDATION_ERROR", "details": [...]}` |
| **`500 Internal Server Error`** | Error inesperado del motor de base de datos PostgreSQL o fallo no capturado en ejecución. | `{"error": "INTERNAL_SERVER_ERROR", "message": "..."}` |
