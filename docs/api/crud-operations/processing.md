# Lógica de Procesamiento y Algoritmos: CRUD Operations API

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Persistencia Relacional ➡️](persistence.md)

---

## 1. Resumen de la Capa de Procesamiento

La capa de procesamiento del motor CRUD se distribuye entre el servicio de dominio (`apps/api/src/modules/crud-operations/crud-operations.service.ts`) y el planificador relacional de borrado (`apps/api/src/modules/crud-operations/postgres-crud-delete-plan.ts`). Su función principal es orquestar las mutaciones atómicas, hacer cumplir las reglas de negocio deportivas, asegurar la inmutabilidad de claves primarias y resolver de forma determinista los árboles de dependencias foráneas.

---

## 2. Planificador de Borrado Relacional en Cascada (`postgres-crud-delete-plan.ts`)

El borrado de entidades relacionales en un esquema altamente interconectado (temporadas, divisiones, competiciones, equipos, jornadas y partidos) requiere resolver el orden de eliminación sin depender de cascadas implícitas no auditadas a nivel de motor de base de datos.

### 2.1 Construcción del Grafo de Claves Foráneas (`fkGraphByParent`)
- **Cita:** `postgres-crud-delete-plan.ts:21-50`
- **Mecanismo:**
  1. Inspecciona en tiempo de ejecución todas las tablas registradas en el esquema de Drizzle (`is(value, PgTable)`), ordenándolas alfabéticamente por su nombre físico (`getTableConfig(table).name.localeCompare(...)`).
  2. Mapea cada clave foránea declarada en `config.foreignKeys`.
  3. Identifica la tabla padre referenciada mediante `fk.reference().foreignTable` e indexa cada arista en el mapa `fkGraphByParent: Map<PgTable, FKEdge[]>`.
  4. Cada arista contiene `{ childTable, parentTable, fk, onDelete: fk.onDelete }`.

### 2.2 Extracción Universal de Claves e Identidad (`key`, `identity`)
- **Cita:** `postgres-crud-delete-plan.ts:55-76`
- **Mecanismo:**
  - Extrae las columnas primarias combinando `config.columns.filter(c => c.primary)` y `config.primaryKeys.flatMap(pk => pk.columns)`.
  - Soporta tanto claves simples (`id`) como claves compuestas (`team_memberships` con `[teamId, discordUserId]`, `rounds` con `[id, idSeasonDivision]`, `seasons_divisions` con `[idSeason, idDivision]`).
  - La función `identity(table, row)` computa `JSON.stringify(key(table, row))`, proporcionando una clave canónica de tipo `string` para su indexación en colecciones `Map` y `Set`.

### 2.3 Bloqueo Concurrente y Matriz Asimétrica de Privilegios (`lockDeletePlan`)
- **Cita:** `postgres-crud-delete-plan.ts:84-116`
- **Mecanismo:**
  - Realiza un bloqueo selectivo a nivel de fila sobre la cuenta del actor en `schema.discordUsers`:
    `.for(purpose === 'delete' ? 'update' : 'share', { noWait: true })`.
  - Captura los errores de bloqueo de PostgreSQL `55P03` (`lock_not_available`) y `40P01` (`deadlock_detected`) inspeccionando hasta 5 niveles de causas anidadas (`depth < 5`), transformándolos en HTTP 409 `DATA_CONFLICT` ("Another operation is changing data. Retry the deletion preview.").
  - **Matriz Asimétrica de Permisos por Rol:**
    - El rol `owner` tiene autorización completa tanto para previsualizar (`preview`) como para ejecutar la eliminación física (`delete`).
    - El rol `admin` **únicamente** puede solicitar previsualizaciones (`purpose === 'preview'`).
    - Si un usuario `admin` intenta ejecutar el borrado destructivo (`purpose === 'delete'`), la línea 112 arroja inmediatamente un error HTTP 403 `FORBIDDEN`:
      ```typescript
      if (actor?.role !== 'owner' && !(purpose === 'preview' && actor?.role === 'admin')) {
        throw new AppError(403, 'FORBIDDEN', 'Only an owner can delete related data.');
      }
      ```

### 2.4 Algoritmo BFS de Expansión, Lotes y Detección de Ciclos (`buildDeletePlan`)
- **Cita:** `postgres-crud-delete-plan.ts:118-249`
- **Mecanismo:**
  1. Inicializa `deleted = new Map<PgTable, Rows>([[root, new Map([[identity(root, row), row]])]])`.
  2. Expande una frontera (`frontier = new Map(deleted)`) recorriendo en anchura (BFS) las aristas donde `onDelete === 'cascade'`.
  3. **Fragmentación por Lotes de 100 Registros:** La función auxiliar `dependents(...)` (`líneas 122-163`) fragmenta las filas a consultar en bloques de 100 (`start += 100`), construyendo cláusulas SQL parametrizadas `or(...)` para evitar sobrecargar los límites de parámetros de PostgreSQL.
  4. **Prevención de Ciclos y Desduplicación:** En la línea 174:
     ```typescript
     if (deleted.get(childTable)?.has(id)) continue;
     ```
     Si un registro ya fue registrado en el árbol de borrado, se omite de inmediato, evitando bucles infinitos ante auto-referencias o ciclos relacionales.
  5. **Límite Operacional Duro de 10.000 Filas:** En las líneas 155-160 y 175-179, si el tamaño acumulado supera 10.000 filas (`size > 10000` o `result.length > 10000`), el proceso se aborta lanzando:
     `AppError(422, 'DELETE_TOO_LARGE', 'Deletion exceeds the 10000-row preview limit. Delete smaller groups first.')`.

### 2.5 Clasificación de Impactos y Criterio de Viabilidad (`allowed`)
- **Cita:** `postgres-crud-delete-plan.ts:198-214, 245`
- **Mecanismo:**
  - Para todas las tablas incorporadas en `deleted`, examina las aristas donde `onDelete !== 'cascade'`.
  - Evalúa la acción resultante:
    - **`set-null`:** Asignada si `onDelete === 'set null'` Y todas las columnas referenciadas en la tabla dependiente admiten valores nulos (`fk.reference().columns.every(col => !col.notNull)`).
    - **`blocked`:** Asignada si la relación es `RESTRICT` o `NO ACTION`, o si alguna de las columnas de clave foránea tiene restricción `NOT NULL`.
  - **Determinación de Viabilidad:**
    ```typescript
    allowed: !impacts.some((impact) => impact.action === 'blocked')
    ```
    Si existe un solo registro dependiente con acción `'blocked'`, la eliminación queda completamente prohibida.

### 2.6 Token Criptográfico de Confirmación SHA-256
- **Cita:** `postgres-crud-delete-plan.ts:230-240`
- **Mecanismo:**
  - Para evitar condiciones de carrera entre la previsualización y la confirmación destructiva, genera un resumen SHA-256 canónico:
    1. Ordena las tablas alfabéticamente por su nombre físico.
    2. Ordena los registros afectados de cada tabla por su clave canónica `identity`.
    3. Serializa a JSON la tupla `[tableName, action, sortedIdentities]`.
    4. Computa el hash SHA-256 en formato hexadecimal de 64 caracteres.
  - Al ejecutar `DELETE /:resource`, el cliente debe enviar este valor en `cascadeConfirmation`. Si el árbol en base de datos sufrió la más mínima alteración, el nuevo hash diferirá y la mutación fallará con HTTP 409 `DELETE_PREVIEW_CHANGED`.

### 2.7 Borrado Topológico Inverso Post-Orden (`deletePlannedDependents`)
- **Cita:** `postgres-crud-delete-plan.ts:251-272`
- **Mecanismo:**
  - Ejecuta un recorrido recursivo en post-orden:
    1. Lleva un registro `visited = new Set<PgTable>()`.
    2. Para cada tabla en `deleted`, si existe otra tabla que depende de ella, procesa recursivamente a la tabla hija primero.
    3. Al desapilar: la tabla raíz (`root`) se omite (la elimina el repositorio al finalizar).
    4. Para cada tabla dependiente, ejecuta `db.delete(table).where(or(...rows.slice(start, start + 100).map(...)))` en lotes parametrizados de 100 filas.

---

## 3. Reglas de Negocio Deportivas (`crud-operations.service.ts`)

El servicio de dominio impone validaciones de integridad competitiva antes de delegar la persistencia:

### 3.1 Partidos (`matches`) — `crud-operations.service.ts:81-104`
- **Formato Válido:** El campo `bestOf` debe ser estrictamente `1`, `3` o `5`.
- **Diferenciación de Rivales:** `team1Id` y `team2Id` deben ser distintos (`team1Id !== team2Id`).
- **Ganador Válido:** Si se define `winnerTeamId`, debe coincidir con `team1Id` o con `team2Id`.
- **Validación de Estado `completed`:**
  - El marcador del equipo ganador debe ser exactamente `Math.floor(bestOf / 2) + 1` (ej. 2 en BO3, 3 en BO5).
  - El marcador del equipo perdedor debe ser estrictamente inferior a dicho umbral.
- **Validación de Estado `forfeit` (Incomparecencia):**
  - Es obligatorio especificar un `winnerTeamId`.

### 3.2 Temporadas (`seasons`) — `crud-operations.service.ts:105-108`
- Si se suministran `startsOn` y `endsOn`, se exige que `endsOn >= startsOn`. En caso contrario, se rechaza con `AppError(422, 'INVALID_DATES', 'Season end date cannot be earlier than start date.')`.

### 3.3 Inmutabilidad de Claves Primarias — `crud-operations.service.ts:46-51`
- En operaciones de actualización (`update`), se prohíbe explícitamente mutar los campos que forman parte de la clave primaria (`resource.keys`). Si el payload contiene un valor distinto para alguna clave, se rechaza con `AppError(422, 'IMMUTABLE_KEY')`.

---

## 4. Efectos Secundarios Automáticos de Dominio

### 4.1 Registro Histórico de Movimientos de Roster (`roster_movements`)
- **Cita:** `postgres-crud-operations.repository.ts:182-204, 474`
- **Mecanismo:** Si el recurso mutado es `memberships` (`team_memberships`), el repositorio intercepta la operación e inserta un evento en `schema.rosterMovements`:
  - **`create`:** Registra acción `'joined'` con el rol asignado.
  - **`delete`:** Registra acción `'left'`.
  - **`update`:**
    - Si varió el rol (`before.role !== after.role`): Registra `'role_changed'`.
    - Si cambió la capitanía (`before.isCaptain !== after.isCaptain`): Registra `'promoted_to_captain'` si ascendió a capitán, o `'demoted_from_captain'` si perdió la capitanía.
  - Persiste `{ teamId, discordUserId, actorId, action, role }`.

### 4.2 Trazabilidad Universal de Auditoría (`audit_logs`)
- **Cita:** `postgres-crud-operations.repository.ts:466-473`
- **Mecanismo:** Toda mutación física exitosa registra en `schema.auditLogs`:
  - `actorDiscordUserId`: Identificador del usuario actuante.
  - `action`: `admin.create`, `admin.update` o `admin.delete`.
  - `entityType`: Nombre del recurso (`resource.name`).
  - `entityId`: Identificador simple del registro (o `null` en claves compuestas).
  - `before`: En borrados almacena `{ record: before, cascade: cascade.preview }`; en actualizaciones almacena el registro previo.
  - `after`: Registro resultante (o `null` en borrados).
