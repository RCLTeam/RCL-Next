# Rutas y Capa de Transporte: CRUD Operations API

[⬅️ Volver a la Documentación del Módulo](README.md) | [Siguiente: Lógica de Procesamiento ➡️](processing.md)

---

## 1. Resumen de la Capa de Transporte

El enrutador de operaciones CRUD (`apps/api/src/modules/crud-operations/crud-operations.router.ts:5-57`) se monta bajo el prefijo `/api/v1/crud-operations` (con soporte canónico en rutas relativas administrativas). Centraliza la exposición de las entidades relacionales de la competición deportiva, aplicando defensas perimetrales de seguridad en cada solicitud.

### Cabeceras Defensivas y Autenticación Centralizada
- **Inhabilitación de Caché:** Todas las rutas del enrutador inyectan `Cache-Control: no-store` (`crud-operations.router.ts:7-9`), impidiendo que respuestas administrativas o metadatos de recursos se almacenen en cachés compartidas o de navegador.
- **Control Perimetral de Acceso:** Se aplica el middleware `requireAuth(auth, 'admin')` (`crud-operations.router.ts:11`) a la totalidad del enrutador. Los usuarios no autenticados o con rol espectador (`viewer`) son rechazados de forma inmediata con HTTP 401 o HTTP 403.
- **Protección Antifalsificación (CSRF):** Antes de registrar los endpoints de mutación (`/matches/:matchId/maps/order`, `/delete-preview`, `POST`, `PUT`, `DELETE`), se interpone `requireTrustedOrigin(auth.frontendOrigin)` (`crud-operations.router.ts:22`), verificando que la cabecera `Origin` coincida con el dominio del cliente web.

---

## 2. Catálogo de Endpoints

### 2.1 Obtener Catálogo de Recursos CRUD

- **Ruta:** `GET /api/v1/crud-operations/resources` (o `/api/v1/crud/resources`)
- **Controlador:** `crud-operations.router.ts:12`
- **Autenticación requerida:** Rol `admin` o `owner`.
- **Parámetros de entrada:** Ninguno.
- **Respuesta exitosa (HTTP 200 OK):**
  ```json
  {
    "data": [
      {
        "name": "seasons",
        "label": "Temporadas",
        "description": "Ediciones anuales de la competición.",
        "keys": ["id"],
        "fields": [...]
      },
      ...
    ]
  }
  ```

---

### 2.2 Listar Opciones de Referencia Foránea

- **Ruta:** `GET /api/v1/crud-operations/references/:resource` (o `GET /api/v1/crud/references/:resource`)
- **Controlador:** `crud-operations.router.ts:16-18`
- **Autenticación requerida:** Rol `admin` o `owner`.
- **Parámetros de ruta:**
  - `:resource` (`string`): Nombre del recurso (`seasons`, `divisions`, `competitions`, `teams`, `users`, etc.).
- **Parámetros de query string:**
  - `search` (`string`, opcional): Texto de filtrado.
  - `offset` (`number`, opcional, por defecto 0): Desplazamiento paginado.
  - `limit` (`number`, opcional, por defecto 50, máximo 250): Tamaño de la ventana de elementos.
- **Comportamiento:** Invoca `service.list(resource, query, true)`, habilitando el flag `forReference` para resolver identificadores y etiquetas legibles (`recordLabel`) requeridas en selectores desplegables de formularios. Permite solicitar hasta un límite ampliado de `limit=250` (a diferencia del límite estándar de 50 registros en `GET /:resource`), asegurando que los desplegables de selección foránea dispongan de conjuntos completos de opciones en una única consulta.

---

### 2.3 Listar Registros con Búsqueda y Paginación

- **Ruta:** `GET /api/v1/crud-operations/:resource` (o `GET /api/v1/crud/:resource`)
- **Controlador:** `crud-operations.router.ts:19-21`
- **Autenticación requerida:** Rol `admin` o `owner`.
- **Parámetros de ruta:**
  - `:resource` (`string`): Identificador del recurso mutable.
- **Parámetros de query string:**
  - `search` (`string`, opcional): Término de búsqueda textual.
  - `offset` (`number`, opcional, por defecto 0): Índice de inicio para la paginación.
  - `limit` (`number`, opcional, por defecto 50, máximo 50): Ventana de paginación fija para listados tabulares.
- **Respuesta exitosa (HTTP 200 OK):**
  ```json
  {
    "data": {
      "records": [
        {
          "id": 1,
          "name": "Temporada 2026",
          "split": "split1",
          "updatedAt": "2026-03-15T12:00:00.000000Z"
        }
      ],
      "hasMore": false
    }
  }
  ```

---

### 2.4 Obtener Mapas de un Partido

- **Ruta:** `GET /api/v1/crud-operations/matches/:matchId/maps` (o `GET /api/v1/crud/matches/:matchId/maps`)
- **Controlador:** `crud-operations.router.ts:13-15`
- **Autenticación requerida:** Rol `admin` o `owner` (`requireAuth(auth, 'admin')`).
- **Parámetros de ruta:**
  - `:matchId` (`string`): Identificador UUID del partido en `matches`.
- **Comportamiento:**
  - Valida el formato UUID de `:matchId` mediante Zod.
  - Verifica la existencia del partido padre en `schema.matches`; si no existe, devuelve HTTP 404 `NOT_FOUND` (`Match`).
  - Proyecta los registros de `schema.matchGames` vinculados a `matchesId`, asociando el nombre legible del equipo ganador (`schema.teams.name`) vía `LEFT JOIN` sobre `winnerTeamId`.
  - Retorna la lista de mapas ordenada de forma estrictamente determinista por `gameNumber asc`.
- **Respuesta exitosa (HTTP 200 OK):**
  ```json
  {
    "data": [
      {
        "id": "40000000-0000-4000-8000-000000000001",
        "gameNumber": 1,
        "externalGameId": "EUW1_1234567890",
        "durationSeconds": 1845,
        "winner": "Movistar Riders"
      },
      {
        "id": "40000000-0000-4000-8000-000000000002",
        "gameNumber": 2,
        "externalGameId": "EUW1_1234567891",
        "durationSeconds": 2100,
        "winner": "Giants Gaming"
      }
    ]
  }
  ```

---

### 2.5 Reordenar Mapas de un Partido

- **Ruta:** `PUT /api/v1/crud-operations/matches/:matchId/maps/order` (o `PUT /api/v1/crud/matches/:matchId/maps/order`)
- **Controlador:** `crud-operations.router.ts:23-30`
- **Autenticación requerida:** Rol `admin` o `owner` (`requireAuth(auth, 'admin')` y `requireTrustedOrigin(auth.frontendOrigin)`).
- **Parámetros de ruta:**
  - `:matchId` (`string`): Identificador UUID del partido.
- **Cuerpo de la petición (JSON):** Contrato `MatchMapOrder`:
  ```json
  {
    "expectedOrder": [
      "40000000-0000-4000-8000-000000000001",
      "40000000-0000-4000-8000-000000000002"
    ],
    "gameIds": [
      "40000000-0000-4000-8000-000000000002",
      "40000000-0000-4000-8000-000000000001"
    ]
  }
  ```
- **Comportamiento y Reglas de Validación:**
  1. **Protección CSRF:** Requiere `Origin` de confianza autorizado.
  2. **Bloqueo Pesimista:** Bloquea en exclusividad el registro padre en `schema.matches` con `SELECT ... FOR UPDATE` (alineado con la concurrencia de importaciones ROFL).
  3. **Concurrencia Optimista (`expectedOrder`):** Compara los IDs y orden actuales de `matchGames` bloqueados con `expectedOrder`. Si difieren (un administrador o worker ROFL alteró los mapas simultáneamente), aborta con HTTP 409 `conflict('The maps have changed. Reload the order before saving.')`.
  4. **Validación de Completitud (`gameIds`):** Valida que `gameIds` contenga exactamente los mismos identificadores que los mapas persistidos, sin omisiones ni duplicados (`Set(gameIds).size === before.length`). Si la permutación es inválida, aborta con HTTP 422 `INVALID_MAP_ORDER` (`Include all maps exactly once`).
  5. **Reasignación Libre de Colisiones:** Desplaza temporalmente las filas a un número de partida libre (`smallint` 1..32767) para eludir la restricción de unicidad relacional `(matches_id, game_number)`.
  6. **Trazabilidad:** Inserta una entrada de auditoría en `schema.auditLogs` con `action: 'admin.reorder-maps'` y snapshots del orden previo y resultante.
- **Errores posibles:**
  - `401 Unauthorized`: Sin sesión activa.
  - `403 Forbidden`: Rol insuficiente o fallo de verificación CSRF.
  - `404 Not Found`: Partido (`matches`) no encontrado.
  - `409 Conflict`: `DATA_CONFLICT` (`The maps have changed. Reload the order before saving.` o ausencia de slot temporal libre).
  - `422 Unprocessable`: `INVALID_MAP_ORDER` (`Include all maps exactly once`).
- **Respuesta exitosa:** `HTTP 204 No Content` (sin cuerpo).

---

### 2.6 Previsualizar Borrado en Cascada

- **Ruta:** `POST /api/v1/crud-operations/:resource/delete-preview`
- **Controlador:** `crud-operations.router.ts:31-39`
- **Autenticación requerida:** Rol `admin` o `owner` (`requireAuth` + `requireTrustedOrigin`).
- **Cuerpo de la petición (JSON):**
  ```json
  {
    "key": { "id": 1 },
    "version": "2026-03-15T12:00:00.000000Z"
  }
  ```
- **Comportamiento Específico:**
  - Tanto `admin` como `owner` pueden invocar la previsualización (`purpose === 'preview'`).
  - El motor bloquea la fila del actor con `lockDeletePlan(tx, actorId, 'preview')` mediante `noWait: true`.
  - Recorre el grafo de claves foráneas y calcula los registros afectados.
  - Si no hay bloqueos por restricciones `RESTRICT` o `NOT NULL`, retorna `allowed: true` junto con el hash SHA-256 de confirmación (`confirmation`).
- **Respuesta exitosa (HTTP 200 OK):**
  ```json
  {
    "data": {
      "confirmation": "a4f89b7c...64hexChars",
      "allowed": true,
      "impacts": [
        {
          "table": "seasons_divisions",
          "action": "delete",
          "count": 3,
          "examples": [{ "idSeason": 1, "idDivision": 1 }]
        }
      ]
    }
  }
  ```

---

### 2.7 Crear Registro

- **Ruta:** `POST /api/v1/crud-operations/:resource`
- **Controlador:** `crud-operations.router.ts:40-55`
- **Autenticación requerida:** Rol `admin` o `owner` (`requireTrustedOrigin`).
- **Cuerpo de la petición (JSON):** Valores del nuevo registro conforme al esquema Zod del recurso.
- **Respuesta exitosa (HTTP 201 Created):**
  ```json
  {
    "data": {
      "id": "30000000-0000-4000-8000-000000000001",
      "name": "Temporada 2027",
      "updatedAt": "2026-09-30T20:00:00.123456Z"
    }
  }
  ```

---

### 2.8 Actualizar Registro (Concurrencia Optimista)

- **Ruta:** `PUT /api/v1/crud-operations/:resource`
- **Controlador:** `crud-operations.router.ts:40-55`
- **Autenticación requerida:** Rol `admin` o `owner` (`requireTrustedOrigin`).
- **Cuerpo de la petición (JSON):**
  ```json
  {
    "key": { "id": "30000000-0000-4000-8000-000000000001" },
    "version": "2026-03-15T12:00:00.000000Z",
    "values": {
      "name": "Temporada 2026 Actualizada"
    }
  }
  ```
- **Comportamiento:** Compara `version` contra el `updatedAt` actual en base de datos. Si difieren, aborta con HTTP 409 `DATA_CONFLICT`.
- **Respuesta exitosa (HTTP 200 OK):** Registro actualizado con su nueva versión temporal.

---

### 2.9 Eliminar Registro en Cascada

- **Ruta:** `DELETE /api/v1/crud-operations/:resource`
- **Controlador:** `crud-operations.router.ts:40-55`
- **Autenticación requerida:** **Exclusivamente rol `owner`**.
- **Cuerpo de la petición (JSON):**
  ```json
  {
    "key": { "id": "30000000-0000-4000-8000-000000000001" },
    "version": "2026-03-15T12:00:00.000000Z",
    "cascadeConfirmation": "a4f89b7c...64hexChars"
  }
  ```
- **Comportamiento Específico:**
  - Si un usuario con rol `admin` intenta ejecutar esta ruta, la línea 112 de `postgres-crud-delete-plan.ts` arroja HTTP 403 `FORBIDDEN`:
    `Only an owner can delete related data.`
  - Si el registro posee dependencias y no se suministra `cascadeConfirmation`, o si existen impactos con acción `'blocked'`, la eliminación se rechaza con HTTP 409 `RELATED_RECORDS`.
  - Si se suministra `cascadeConfirmation` pero el grafo cambió, se rechaza con HTTP 409 `DELETE_PREVIEW_CHANGED`.
- **Respuesta exitosa:** `HTTP 204 No Content` (sin cuerpo).

---

### 2.10 Catálogo de Recursos Administrables y Especificación de Campos

El catálogo `crudResources` (`crud-operations.resources.ts:60-175`) define los metadatos y esquemas de los recursos mutables expuestos:

- **`seasons` (Temporadas):** `name` (PK inmutable, texto 120), `startsOn` (date), `endsOn` (date).
- **`divisions` (Divisiones):** `name` (PK inmutable, texto 80), `sortOrder` (número 0..32767).
- **`competitions` (Competiciones):** `id` (PK UUID), `seasonName` (ref: `seasons`), `divisionName` (ref: `divisions`).
- **`teams` (Equipos):**
  - `id`: Clave primaria UUID (`keys: ['id']`).
  - `seasonDivisionId`: Clave foránea referenciando a `competitions` (`type: 'select'`, obligatoria).
  - `name`: Nombre oficial del equipo (`type: 'text'`, max 120, obligatorio).
  - `shortName`: Abreviatura o tag del equipo (`type: 'text'`, max 16, opcional).
  - `logoUrl`: URL o ruta del escudo (`type: 'text'`, max 2048, opcional).
  - `color`: Código hexadecimal de color `#RRGGBB` (`type: 'text'`, max 7, opcional).
  - `discordRoleId`: Identificador del rol de Discord del equipo (`type: 'text'`, max 20, nullable/opcional). Permite enlazar el Snowflake del rol de Discord para automatización de menciones y sincronización comunitaria de roles de plantilla.
  - `isActive`: Indicador de equipo en activo (`type: 'boolean'`, obligatorio, por defecto `true`).
- **`players` (Jugadores):** `id` (PK UUID), `gameName` (texto 64), `riotTag` (texto 16), `discordUserId` (ref: `users`, opcional), `puuid` (texto 128), `countryCode` (texto 2), `isMain` (booleano).
- **`memberships` (Plantillas):** Clave compuesta `[teamId, discordUserId]`, `role` (enum: top, jungle, mid, adc, support, substitute, coach, staff, partners), `isCaptain` (booleano).
- **`rounds` (Jornadas):** Clave compuesta `[id, idSeasonDivision]`, `stage` (enum: regular, playoff), `name` (texto 120), `startsAt` (datetime).
- **`matches` (Encuentros):** `id` (PK UUID), `idSeasonDivision` (ref: `competitions`), `idRound` (ref: `rounds`), `team1Id`, `team2Id`, `bestOf` (1, 3, 5), `status` (scheduled, live, completed, forfeit, cancelled), `team1Score`, `team2Score`, `winnerTeamId`, `scheduledAt`, `finishedAt`, `streamUrl`, `streamUrlLive`.

---

## 3. Catálogo de Respuestas de Error

| Código HTTP | Código Interno (`error.code`) | Causa Fisiológica |
|---|---|---|
| **401 Unauthorized** | `UNAUTHORIZED` | Ausencia de cookie de sesión válida o expirada. |
| **403 Forbidden** | `FORBIDDEN` | Usuario con rol insuficiente (ej. `admin` intentando un borrado destructivo) o petición con cabecera `Origin` no confiable (CSRF). |
| **404 Not Found** | `NOT_FOUND` | Recurso no existente en el catálogo, partido no encontrado (`Match`), o intento de mutar `users`. |
| **409 Conflict** | `DATA_CONFLICT` | Colisión de concurrencia optimista (`version !== updatedAt`), desfasaje de mapas en reordenación (`The maps have changed. Reload the order before saving.`), bloqueo concurrente (`55P03`), o ausencia de slots temporales libres. |
| **409 Conflict** | `DELETE_PREVIEW_CHANGED` | El grafo de dependencias cambió entre la previsualización y la confirmación. |
| **409 Conflict** | `RELATED_RECORDS` | Existen entidades dependientes bloqueantes (`action: 'blocked'`). |
| **422 Unprocessable** | `DELETE_TOO_LARGE` | El borrado acumulado supera el límite operativo duro de 10.000 filas. |
| **422 Unprocessable** | `INVALID_DATES` | En `seasons`, fecha de fin anterior a fecha de inicio (`endsOn < startsOn`). |
| **422 Unprocessable** | `INVALID_MAP_ORDER` | En reordenación de mapas, la lista no incluye todos los mapas exactamente una vez (`Include all maps exactly once`). |
| **422 Unprocessable** | `VALIDATION_ERROR` | Los datos no superan el esquema Zod del recurso (campos obligatorios o formatos inválidos). |
