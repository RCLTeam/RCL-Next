# Persistencia Relacional y Consultas: CRUD Operations API

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Validación y Seguridad ➡️](validation.md)

---

## 1. Resumen de la Capa de Persistencia

El acceso a datos relacionales está implementado por la clase `PostgresCrudOperationsRepository` (`apps/api/src/modules/crud-operations/postgres-crud-operations.repository.ts`), que satisface el contrato de interfaz `CrudOperationsRepository` (`crud-operations.repository.ts:1-29`).

Esta capa implementa un motor dinámico sobre Drizzle ORM que mapea metadatos tipados a tablas físicas de PostgreSQL, gestiona bloqueos transaccionales a nivel de fila, asegura concurrencia optimista, coordina la reordenación atómica de mapas y enriquece consultas paginadas con búsquedas de alta relevancia.

---

## 2. Mapeo Dinámico de Tablas Físicas (`resourceTables`)

El repositorio desacopla los nombres de recursos de la API de las tablas internas del esquema (`postgres-crud-operations.repository.ts:27-37`):

```typescript
const resourceTables: Record<string, PgTable> = {
  seasons: schema.seasons,
  divisions: schema.divisions,
  competitions: schema.seasonsDivisions,
  teams: schema.teams,
  users: schema.discordUsers,
  players: schema.players,
  memberships: schema.teamMemberships,
  rounds: schema.rounds,
  matches: schema.matches
};
```

### Gestión y Exclusión del Recurso `users`
- La tabla `schema.discordUsers` está presente en `resourceTables` (línea 32) y registrada en `crudReferences` (`crud-operations.resources.ts:6-17`) para permitir la búsqueda y resolución de miembros en selectores foráneos (`GET /references/users`).
- Sin embargo, `users` está deliberadamente **EXCLUIDA** de la lista `crudResources` (`crud-operations.resources.ts:60`).
- En el método `mutate(...)` (`postgres-crud-operations.repository.ts:503-504`):
  ```typescript
  if (!crudResources.some((resource) => resource.name === descriptor.name)) {
    throw notFound('CRUD resource');
  }
  ```
  Esto garantiza que ninguna cuenta de usuario ni credencial pueda insertarse, mutarse o eliminarse a través de la API CRUD (devolviendo HTTP 404).

---

## 3. Concurrencia Optimista con Formato UTC de Microsegundos

Para evitar sobrescrituras silenciosas (*lost updates*) en entornos administrativos concurrentes:

- **Formato Canónico de Versión:** En cada consulta de selección (`postgres-crud-operations.repository.ts:69-72`), la columna `updatedAt` se formatea con precisión de microsegundos forzando zona horaria UTC:
  ```sql
  to_char(${column(table, 'updatedAt')} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ```
- **Verificación en Previsualización y Mutación:**
  - En `previewDelete` (línea 307) y en `mutate` (línea 520):
    ```typescript
    if (before.updatedAt !== mutation.version) {
      throw conflict('This record changed. Reload it before saving.');
    }
    ```
  - Si cualquier administrador modificó el registro entre el momento en que el usuario abrió el formulario y el momento de guardar, la operación es abortada con HTTP 409 `DATA_CONFLICT`.

---

## 4. Motor Dinámico de Búsqueda, Escape SQL y Ranking (`list`)

El método `list(...)` (`postgres-crud-operations.repository.ts:315-500`) ejecuta consultas de búsqueda de texto completo y resolución de referencias:

### 4.1 Inmunidad a Inyecciones de Comodines SQL
- **Cita:** `postgres-crud-operations.repository.ts:323`
- **Mecanismo:** Antes de generar cláusulas `ILIKE`, se escapan todos los caracteres de control relacional:
  ```typescript
  const searchEscaped = search.replace(/[\\%_]/g, '\\$&');
  ```
  Esto inhabilita ataques basados en comodines (`%`, `_`) y previene búsquedas que puedan degradar el rendimiento del motor de base de datos.

### 4.2 Búsqueda en Múltiples Columnas y Entidades Foráneas
- Itera sobre todas las columnas declaradas con tipo `'text'`, `'select'` o `'url'`, generando condiciones `ilike(col, `%${searchEscaped}%`)`.
- **Búsqueda en Tablas Relacionadas (`lines 349-410`):** Si un campo es una clave foránea (`field.reference`), busca en la tabla de destino mediante subconsultas SQL correlacionadas:
  ```sql
  EXISTS (
    SELECT 1 FROM target_table 
    WHERE target_table.target_key = current_table.local_key 
      AND (target_table.name ILIKE '%search%' OR ...)
  )
  ```
- **Caso Especial `competitions` (`lines 378-401`):** Al buscar competiciones (`seasons_divisions`), examina de forma simultánea `seasons.name` y `divisions.name`.

### 4.3 Ranking de Relevancia Ponderado
- **Cita:** `postgres-crud-operations.repository.ts:415-424`
- **Mecanismo:** Clasifica los resultados mediante una expresión SQL `CASE`:
  - **Prioridad 0 (Prefijo exacto):** Coincidencia al inicio del campo (`col ILIKE searchEscaped%`).
  - **Prioridad 1 (Subcadena):** Coincidencia en cualquier parte del campo (`col ILIKE %searchEscaped%`).
  - **Prioridad 2:** Resto de registros coincidentes en campos secundarios o foráneos.
  - **Criterio de Desempate:** Ordenación ascendente por las columnas de clave primaria (`asc(column)`).

### 4.4 Paginación Dinámica y Detección de Páginas Siguientes
- **Cita:** `postgres-crud-operations.repository.ts:428-433, 499`
- **Mecanismo:** Ejecuta la consulta con `limit(limit + 1)` y `offset(offset)`.
  - Extrae los registros de la página: `page = result.slice(0, limit)`.
  - Evalúa `hasMore = result.length > limit`, evitando una consulta redundante de `COUNT(*)` sobre tablas voluminosas.
  - Admite un parámetro configurable `limit` que permite ventanas de hasta 250 elementos en peticiones de referencia foránea (`GET /references/:resource`).

### 4.5 Enriquecimiento Foráneo en Lote (`lines 434-497`)
- Tras recuperar los registros de la página actual, recopila en memoria los identificadores foráneos únicos y realiza una única consulta por tabla relacionada (`or(...references.map(...))`).
- Agrega la propiedad calculada `${fieldName}Label` a cada fila:
  - Competiciones: `${seasonName} · ${divisionName}`.
  - Miembros de Discord: `${username} · ${discordId}`.
  - Jornadas: `Jornada ${id} · ${stage}`.
  - Equipos / Jugadores: `String(match.name)`.

---

## 5. Gestión y Reordenación de Mapas de Partido

### 5.1 Consulta de Mapas de Encuentro (`matchMaps`)
- **Cita:** `postgres-crud-operations.repository.ts:209-228`
- **Comportamiento:**
  1. Valida la existencia del partido en `schema.matches` mediante `select({ id: matches.id })`. Si no existe, arroja `notFound('Match')` (HTTP 404).
  2. Ejecuta una consulta sobre `schema.matchGames` filtrando por `eq(matchGames.matchesId, matchId)`.
  3. Realiza un `LEFT JOIN` con `schema.teams` (`eq(teams.id, matchGames.winnerTeamId)`) para proyectar el nombre legible del equipo ganador (`winner: teams.name`).
  4. Ordena los mapas mediante `orderBy(asc(matchGames.gameNumber))`.
  5. Retorna la colección formateada conforme al contrato `AdminMatchMap[]`.

```typescript
async matchMaps(matchId: string) {
  const { matches, matchGames } = schema;
  const [match] = await this.db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.id, matchId));
  if (!match) throw notFound('Match');
  return this.db
    .select({
      id: matchGames.id,
      gameNumber: matchGames.gameNumber,
      externalGameId: matchGames.externalGameId,
      durationSeconds: matchGames.durationSeconds,
      winner: teams.name
    })
    .from(matchGames)
    .leftJoin(teams, eq(teams.id, matchGames.winnerTeamId))
    .where(eq(matchGames.matchesId, matchId))
    .orderBy(asc(matchGames.gameNumber));
}
```

### 5.2 Transacción Pesimista de Reordenación Atómica (`reorderMaps`)
- **Cita:** `postgres-crud-operations.repository.ts:230-293`
- **Mecanismos de Concurrencia y Consistencia:**

1. **Bloqueo Pesimista del Partido Padre (`SELECT ... FOR UPDATE`):**
   - Ejecuta `tx.select({ id: matches.id }).from(matches).where(eq(matches.id, matchId)).for('update')`.
   - Utiliza exactamente el mismo mecanismo de bloqueo pesimista que la ingesta de archivos ROFL antes de leer o alterar la secuencia de mapas, impidiendo condiciones de carrera entre la interfaz administrativa y el procesador de partidas en segundo plano.

2. **Bloqueo y Lectura de Mapas Existentes:**
   - Lee todos los mapas actuales bloqueándolos para actualización:
     ```typescript
     const before = await tx
       .select({ id: matchGames.id, gameNumber: matchGames.gameNumber })
       .from(matchGames)
       .where(eq(matchGames.matchesId, matchId))
       .orderBy(asc(matchGames.gameNumber))
       .for('update');
     ```

3. **Verificación de Concurrencia Optimista (`expectedOrder`):**
   - Comprueba que la cantidad de mapas y su secuencia exacta coincidan con `order.expectedOrder`:
     ```typescript
     if (
       before.length !== order.expectedOrder.length ||
       before.some((game, index) => game.id !== order.expectedOrder[index])
     )
       throw conflict('The maps have changed. Reload the order before saving.');
     ```
   - Si otro administrador reordenó mapas o una repetición ROFL fue importada en el ínterin, la mutación se aborta con HTTP 409 `DATA_CONFLICT`.

4. **Validación de Integridad de la Permutación (`gameIds`):**
   - Comprueba que `order.gameIds` contenga exactamente los mismos identificadores que `before`, sin duplicados ni mapas omitidos:
     ```typescript
     if (
       order.gameIds.length !== before.length ||
       new Set(order.gameIds).size !== before.length ||
       order.gameIds.some((id) => !before.some((game) => game.id === id))
     )
       throw new AppError(422, 'INVALID_MAP_ORDER', 'Include all maps exactly once');
     ```

5. **Algoritmo de Reubicación Atómica y Evasión de Restricciones Únicas:**
   - La base de datos contiene una restricción relacional `UNIQUE (matches_id, game_number)`. Una actualización simultánea de múltiples filas violaría la restricción en pasos intermedios.
   - Para solventarlo, el algoritmo identifica un número temporal libre positivo de tipo `smallint` (1..32767):
     ```typescript
     const positions = new Map(before.map((game) => [game.id, game.gameNumber]));
     const occupied = new Set(positions.values());
     let temporary = 1;
     while (occupied.has(temporary) && temporary <= 32767) temporary++;
     if (temporary > 32767) throw conflict('No free position is available to reorder the maps.');
     ```
   - Para cada mapa en la nueva posición `target = index + 1`:
     - Si ya se encuentra en `target`, se omite.
     - Si la posición objetivo está ocupada por otro mapa (`other`), ejecuta un intercambio seguro en 3 pasos:
       1. Mueve `other` al slot temporal (`temporary`).
       2. Mueve el mapa actual al slot `target`.
       3. Mueve `other` a la posición anterior liberada `current`.
     - Cada movimiento actualiza `gameNumber` y `updatedAt: new Date()` en `matchGames`.

6. **Auditoría Transaccional Inmutable:**
   - Registra de forma inmediata la mutación en `schema.auditLogs`:
     ```typescript
     await tx.insert(auditLogs).values({
       actorDiscordUserId: actorId,
       action: 'admin.reorder-maps',
       entityType: 'matches',
       entityId: matchId,
       before,
       after: order.gameIds.map((id, index) => ({ id, gameNumber: index + 1 }))
     });
     ```
   - Toda la secuencia se ejecuta dentro de `this.db.transaction`. Si cualquier paso genera un error o colisión, la transacción se cancela íntegramente mediante rollback.

---

## 6. Bloqueos Concurrente y Gestión Transaccional de Mutación

### 6.1 Bloqueo Selectivo `noWait` (`lockDeletePlan`)
- Utiliza bloqueos consultivos de fila sobre `schema.discordUsers`:
  `.for(purpose === 'delete' ? 'update' : 'share', { noWait: true })`.
- Si otra transacción concurrente mantiene bloqueado el recurso, PostgreSQL eleva el código `55P03`. El repositorio lo captura inmediatamente y lo transforma en HTTP 409 `DATA_CONFLICT`, garantizando que ninguna transacción quede colgada indefinidamente esperando bloqueos.

### 6.2 Atomicidad Transaccional de Mutación (`mutate`)
- Toda operación de mutación (`create`, `update`, `delete`) se envuelve en `db.transaction(async (tx) => { ... })`.
- En eliminaciones en cascada:
  1. Ejecuta `lockDeletePlan(tx, actorId, 'delete')`.
  2. Valida la coincidencia del token `cascadeConfirmation`.
  3. Valida la versión optimista (`before.updatedAt === mutation.version`).
  4. Ejecuta `deletePlannedDependents(tx, cascade.plan)`.
  5. Elimina la fila raíz en `resourceTables[descriptor.name]`.
  6. Inserta el movimiento de roster en `schema.rosterMovements` (si aplica).
  7. Inserta el registro de auditoría en `schema.auditLogs`.
  8. Si cualquier paso falla, toda la transacción se revierte íntegramente.
