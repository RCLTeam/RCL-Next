# Persistencia Relacional y Restauración: Database Transfer API

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Validación y Seguridad ➡️](validation.md)

---

## 1. Resumen de la Capa de Persistencia

El repositorio `PostgresDatabaseTransferRepository` (`apps/api/src/modules/database-transfer/postgres-database-transfer.repository.ts:1-277`) implementa el contrato de interfaz `DatabaseTransferRepository` (`database-transfer.repository.ts:1-12`).

Se encarga de la manipulación atómica de datos a gran escala sobre PostgreSQL, calculando el orden topológico de inserción para respetar la jerarquía de claves foráneas, validando la compatibilidad de esquemas mediante la tabla de migraciones de Drizzle y ejecutando la restauración con purga de sesiones y salvaguarda del usuario administrador.

---

## 2. Orden Topológico de Inserción y Truncado (`insertOrder`)

Para insertar o eliminar registros masivamente sin violar restricciones de clave foránea (`FOREIGN KEY constraints`):

### 2.1 Algoritmo de Ordenación Topológica
- **Cita:** `postgres-database-transfer.repository.ts:63-71`
- **Mecanismo:** La función constructora del repositorio recorre el grafo de dependencias de las 21 tablas relacionales del esquema:
  ```typescript
  const visited = new Set<PgTable>();
  const insertOrder: PgTable[] = [];

  function visit(table: PgTable) {
    if (visited.has(table)) return;
    visited.add(table);
    for (const fk of getTableConfig(table).foreignKeys) {
      visit(fk.reference().foreignTable);
    }
    insertOrder.push(table);
  }

  for (const table of allTables) visit(table);
  ```
- **Orden de Inserción:** Las tablas raíz o padre (sin claves foráneas dependientes, como `seasons`, `divisions`, `discord_users`) se posicionan al principio de `insertOrder`, mientras que las tablas subordinadas (`matches`, `match_games`, `match_player_stats`) se colocan al final.
- **Orden de Truncado:** Al vaciar la base de datos previa a la carga, las tablas se truncan en orden inverso (`[...insertOrder].reverse()`), liquidando primero los hijos antes de los padres.

---

## 3. Verificación de Compatibilidad del Historial de Migraciones

Antes de alterar la base de datos viva, el repositorio certifica que el volcado provenga exactamente del mismo nivel evolutivo de base de datos:

- **Cita:** `postgres-database-transfer.repository.ts:215-229`
- **Mecanismo:**
  1. Consulta la tabla interna `drizzle.__drizzle_migrations` de la base de datos viva.
  2. Extrae las filas de `drizzle.__drizzle_migrations` contenidas en el volcado de respaldo.
  3. Compara de forma biunívoca los hashes SHA-256 de las migraciones aplicadas y sus marcas de tiempo (`created_at`).
  4. Si existe cualquier migración faltante, sobrante o con un hash diferente, la operación se cancela lanzando:
     `AppError(422, 'INCOMPATIBLE_BACKUP', 'The backup schema does not match the active database migrations.')`.

---

## 4. Restauración Definitiva e Invariantes de Seguridad (`replaceData`)

El método `replaceData(...)` (`postgres-database-transfer.repository.ts:131-170, 258-275`) ejecuta la sustitución física dentro de una única transacción de base de datos:

### 4.1 Verificación Estricta del Token de Previsualización
- Compara el token remitido por el cliente en la cabecera `X-Import-Confirmation` con el valor calculado en la previsualización:
  ```typescript
  if (prepared.preview.confirmation !== confirmation) {
    throw new AppError(409, 'IMPORT_PREVIEW_CHANGED', 'The database or backup changed since preview.');
  }
  ```

### 4.2 Truncado Masivo y Carga por Lotes
- Ejecuta una sentencia atómica `TRUNCATE TABLE ... CASCADE` sobre todas las tablas del esquema.
- Itera sobre `insertOrder` insertando los datos de cada tabla en bloques de 200 filas mediante `jsonb_populate_recordset` de PostgreSQL, optimizando el rendimiento de I/O y memoria.

### 4.3 Revocación Universal de Sesiones Activas
- **Cita:** `postgres-database-transfer.repository.ts:154-155`
- **Mecanismo:** Para prevenir que usuarios antiguos conserven sesiones válidas con identificadores que ya no coincidan o pertenezcan a estados previos:
  ```typescript
  await db.delete(schema.authSessions);
  await db.delete(schema.oauthStates);
  ```
  Fuerza a todos los usuarios a autenticarse nuevamente a través del flujo OAuth2 de Discord.

### 4.4 Salvaguarda Antidesalojo del Propietario (`owner`)
- **Cita:** `postgres-database-transfer.repository.ts:156-159`
- **Mecanismo de Salvaguarda:**
  - Si un volcado importado contiene una versión antigua de la tabla `discord_users` donde el usuario administrador actual aún no existía, o donde figuraba con rol `viewer`, el administrador quedaría inmediatamente bloqueado sin acceso a la plataforma.
  - Para neutralizar este vector de fallo crítico, el repositorio reinserta de forma explícita al usuario actuante forzando su rol a `owner`:
    ```typescript
    await db
      .insert(schema.discordUsers)
      .values(owner)
      .onConflictDoUpdate({
        target: schema.discordUsers.discordId,
        set: { role: 'owner' }
      });
    ```
  - Esto garantiza que el propietario que ejecuta la restauración conserve intactos sus privilegios de gobernanza independientemente del contenido histórico del archivo `.dump`.

### 4.5 Auditoría Inmutable
- **Cita:** `postgres-database-transfer.repository.ts:161-169`
- **Mecanismo:** Inserta un registro inmutable en `schema.auditLogs`:
  - `actorDiscordUserId`: ID del usuario `owner` que ordenó la importación.
  - `action`: `'database-transfer.import'`.
  - `entityType`: `'database'`.
  - `entityId`: `'full_restore'`.
  - `after`: Snapshot con los recuentos de filas importadas por tabla.
