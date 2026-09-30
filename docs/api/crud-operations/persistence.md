# Persistencia Relacional y Consultas: CRUD Operations API

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Validación y Seguridad ➡️](validation.md)

---

## 1. Resumen de la Capa de Persistencia

El acceso a datos relacionales está implementado por la clase `PostgresCrudOperationsRepository` (`apps/api/src/modules/crud-operations/postgres-crud-operations.repository.ts`), que satisface el contrato de interfaz `CrudOperationsRepository` (`crud-operations.repository.ts:1-17`).

Esta capa implementa un motor dinámico sobre Drizzle ORM que mapea metadatos tipados a tablas físicas de PostgreSQL, gestiona bloqueos transaccionales a nivel de fila, asegura concurrencia optimista y enriquece consultas paginadas con búsquedas de alta relevancia.

---

## 2. Mapeo Dinámico de Tablas Físicas (`resourceTables`)

El repositorio desacopla los nombres de recursos de la API de las tablas internas del esquema (`postgres-crud-operations.repository.ts:27-43`):

```typescript
const resourceTables = {
  seasons: schema.seasons,
  divisions: schema.divisions,
  competitions: schema.seasonsDivisions,
  teams: schema.teams,
  users: schema.discordUsers,
  players: schema.players,
  memberships: schema.teamMemberships,
  rounds: schema.rounds,
  matches: schema.matches
} as const;
```

### Gestión y Exclusión del Recurso `users`
- La tabla `schema.discordUsers` está presente en `resourceTables` (línea 32) y registrada en `crudReferences` (`crud-operations.resources.ts:6-17`) para permitir la búsqueda y resolución de miembros en selectores foráneos (`GET /references/users`).
- Sin embargo, `users` está deliberadamente **EXCLUIDA** de la lista `crudResources` (`crud-operations.resources.ts:60`).
- En el método `mutate(...)` (`postgres-crud-operations.repository.ts:408`):
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
  - En `previewDelete` (línea 220) y en `mutate` (línea 425):
    ```typescript
    if (before.updatedAt !== mutation.version) {
      throw conflict('This record changed. Reload it before saving.');
    }
    ```
  - Si cualquier administrador modificó el registro entre el momento en que el usuario abrió el formulario y el momento de guardar, la operación es abortada con HTTP 409 `DATA_CONFLICT`.

---

## 4. Motor Dinámico de Búsqueda, Escape SQL y Ranking (`list`)

El método `list(...)` (`postgres-crud-operations.repository.ts:229-405`) ejecuta consultas de búsqueda de texto completo y resolución de referencias:

### 4.1 Inmunidad a Inyecciones de Comodines SQL
- **Cita:** `postgres-crud-operations.repository.ts:237`
- **Mecanismo:** Antes de generar cláusulas `ILIKE`, se escapan todos los caracteres de control relacional:
  ```typescript
  const searchEscaped = search.replace(/[\\%_]/g, '\\$&');
  ```
  Esto inhabilita ataques basados en comodines (`%`, `_`) y previene búsquedas que puedan degradar el rendimiento del motor de base de datos.

### 4.2 Búsqueda en Múltiples Columnas y Entidades Foráneas
- Itera sobre todas las columnas declaradas con tipo `'text'`, `'select'` o `'url'`, generando condiciones `ilike(col, `%${searchEscaped}%`)`.
- **Búsqueda en Tablas Relacionadas (`lines 263-315`):** Si un campo es una clave foránea (`field.reference`), busca en la tabla de destino mediante subconsultas SQL correlacionadas:
  ```sql
  EXISTS (
    SELECT 1 FROM target_table 
    WHERE target_table.target_key = current_table.local_key 
      AND (target_table.name ILIKE '%search%' OR ...)
  )
  ```
- **Caso Especial `competitions` (`lines 292-315`):** Al buscar competiciones (`seasons_divisions`), examina de forma simultánea `seasons.name` y `divisions.name`.

### 4.3 Ranking de Relevancia Ponderado
- **Cita:** `postgres-crud-operations.repository.ts:323-332`
- **Mecanismo:** Clasifica los resultados mediante una expresión SQL `CASE`:
  - **Prioridad 0 (Prefijo exacto):** Coincidencia al inicio del campo (`col ILIKE searchEscaped%`).
  - **Prioridad 1 (Subcadena):** Coincidencia en cualquier parte del campo (`col ILIKE %searchEscaped%`).
  - **Prioridad 2:** Resto de registros coincidentes en campos secundarios o foráneos.
  - **Criterio de Desempate:** Ordenación ascendente por las columnas de clave primaria (`asc(column)`).

### 4.4 Paginación Fija con Detección de Páginas Siguientes
- **Cita:** `postgres-crud-operations.repository.ts:340-345`
- **Mecanismo:** Ejecuta la consulta con `limit(51)` y `offset(offset)`.
  - Extrae los primeros 50 registros: `page = result.slice(0, 50)`.
  - Evalúa `hasMore = result.length > 50`, evitando una consulta redundante de `COUNT(*)` sobre tablas voluminosas.

### 4.5 Enriquecimiento Foráneo en Lote (`lines 348-402`)
- Tras recuperar los 50 registros de la página actual, recopila en memoria los identificadores foráneos únicos y realiza una única consulta por tabla relacionada (`inArray(...)`).
- Agrega la propiedad calculada `${fieldName}Label` a cada fila:
  - Competiciones: `${seasonName} · ${divisionName}`.
  - Miembros de Discord: `${username} · ${discordId}`.
  - Jornadas: `Jornada ${id} · ${stage}`.
  - Equipos / Jugadores: `String(match.name)`.

---

## 5. Bloqueos Concurrente y Gestión Transaccional

### 5.1 Bloqueo Selectivo `noWait` (`lockDeletePlan`)
- Utiliza bloqueos consultivos de fila sobre `schema.discordUsers`:
  `.for(purpose === 'delete' ? 'update' : 'share', { noWait: true })`.
- Si otra transacción concurrente mantiene bloqueado el recurso, PostgreSQL eleva el código `55P03`. El repositorio lo captura inmediatamente y lo transforma en HTTP 409 `DATA_CONFLICT`, garantizando que ninguna transacción quede colgada indefinidamente esperando bloqueos.

### 5.2 Atomicidad Transaccional de Mutación (`mutate`)
- Toda operación de mutación (`create`, `update`, `delete`) se envuelve en `db.transaction(async (tx) => { ... })`.
- En eliminaciones en cascada:
  1. Ejecuta `lockDeletePlan(tx, actorId, 'delete')`.
  2. Valida la coincidencia del token `cascadeConfirmation`.
  3. Ejecuta `deletePlannedDependents(tx, cascade.plan)`.
  4. Elimina la fila raíz en `resourceTables[descriptor.name]`.
  5. Inserta el movimiento de roster en `schema.rosterMovements` (si aplica).
  6. Inserta el registro de auditoría en `schema.auditLogs`.
  7. Si cualquier paso falla, toda la transacción se revierte íntegramente.
