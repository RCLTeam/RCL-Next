# Migraciones, Concurrencia y Verificación Criptográfica

[⬅️ Volver a Documentación de Base de Datos](./README.md) | [Siguiente: Backfill de MVP históricos ➡️](./mvp-backfill.md)

---

Para poblar los MVP históricos después de aplicar las migraciones `0002_match_mvp` y `0003_match_mvp_checks`, consultar [Backfill de MVP históricos](./mvp-backfill.md).

## 1. Arquitectura de Migraciones

La base de datos utiliza **Drizzle Kit** y un ejecutor programático dedicado ubicado en `packages/database/src/migrate.ts` para aplicar evoluciones del esquema relacional de forma segura y reproducible.

Las migraciones SQL versionadas residen en el directorio `packages/database/drizzle/`:
- `0000_initial_schema.sql`: Contiene el DDL completo del esquema baseline, la creación de tipos enumerados, restricciones, índices y los procedimientos y disparadores PL/pgSQL.
- `0001_competitive_membership_per_season.sql`: Añade la temporada a equipos e inscripciones, claves foráneas compuestas y la exclusión de varias inscripciones competitivas por usuario y temporada. Los conflictos previos abortan la migración sin borrar ni reasignar inscripciones.
- `0002_match_mvp.sql`: Añade `matches.mvp_player_id`, su FK a `players` con `ON DELETE SET NULL`, `mvp_score numeric(5,1)` y el índice parcial `matches_round_mvp_score_idx`.
- `0003_match_mvp_checks.sql`: Impide puntuaciones negativas y jugadores MVP con puntuación nula; permite conservar el score cuando se elimina el jugador.
- `0004_editor_role.sql`: Añade `editor` al enum `public.app_role`, antes de `admin`, conservando los usuarios y sus roles existentes. Su tag es `0004_editor_role` y su snapshot es `meta/0004_snapshot.json`. Se aplica con `pnpm db:migrate` antes de asignar el nuevo rol.
- `meta/_journal.json`: Inventario ordenado de migraciones versionadas generado por Drizzle Kit. La tabla `drizzle.__drizzle_migrations` registra cuáles se han aplicado en cada base; los snapshots versionados describen el esquema tras cada migración.

---

## 2. Bloqueo Consultivo y Control de Concurrencia (`pg_advisory_lock`)

Para evitar condiciones de carrera cuando múltiples contenedores de la API o runners de integración continua intentan migrar la base de datos de manera simultánea en el despliegue, el ejecutor adquiere un bloqueo consultivo a nivel de sesión en PostgreSQL:

```typescript
// packages/database/src/migrate.ts:10-12
const client = await connection.pool.connect();
try {
  await client.query('SELECT pg_advisory_lock(72160419)');
  // ... operaciones de verificación y migración ...
} finally {
  await client.query('SELECT pg_advisory_unlock(72160419)');
  client.release();
}
```

### Características del Bloqueo:
- **Identificador Único del Bloqueo:** `72160419` (clave estática asignada al subproceso de migración).
- **Ámbito de Sesión:** El bloqueo es retenido por la conexión cliente durante todo el ciclo de migración. Si otra instancia intenta migrar concurrentemente, espera de forma bloqueante a que la primera termine y libere el cerrojo.
- **Liberación Garantizada:** La sentencia `SELECT pg_advisory_unlock(72160419)` se ejecuta en el bloque `finally` para asegurar su liberación inmediata, incluso ante excepciones no controladas.

---

## 3. Detección de Esquema Huérfano no Gestionado

Antes de aplicar cualquier cambio, el ejecutor verifica si la base de datos contiene tablas existentes sin el registro de seguimiento de Drizzle:

```typescript
// packages/database/src/migrate.ts:13-23
const { rows } = await client.query<{ exists: boolean }>(
  "SELECT to_regclass('public.seasons') IS NOT NULL AS exists"
);
const tracking = await client.query<{ exists: boolean }>(
  "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists"
);
if (rows[0]?.exists && !tracking.rows[0]?.exists) {
  throw new Error(
    'Existing untracked schema detected. Use a new empty database; do not baseline production automatically.'
  );
}
```

### Propósito Defensivo:
Si la tabla de catálogo `public.seasons` existe pero no existe la tabla de control `drizzle.__drizzle_migrations`, significa que la base de datos fue creada por un proceso externo no gestionado o por un dump manual. El sistema aborta de inmediato para evitar sobrescribir datos en producción o corromper el catálogo de migraciones.

---

## 4. Detección de Deriva Criptográfica (Hash Drift Detection)

Si la tabla de control `drizzle.__drizzle_migrations` existe, el ejecutor valida la integridad criptográfica de los archivos SQL de migración en disco contra los hashes registrados en la base de datos:

```typescript
// packages/database/src/migrate.ts:24-34
if (tracking.rows[0]?.exists) {
  const applied = await client.query<{ hash: string }>(
    'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at'
  );
  const files = readMigrationFiles({ migrationsFolder });
  if (applied.rows.some((row, index) => row.hash !== files[index]?.hash)) {
    throw new Error(
      'Migration history differs from these files. Plan an explicit upgrade; existing data was not modified.'
    );
  }
}
```

### Propósito Defensivo:
- Cada migración aplicada almacena su digest criptográfico SHA-256 en la columna `hash` de `drizzle.__drizzle_migrations`.
- Si un desarrollador o proceso modifica retroactivamente un archivo `.sql` ya aplicado, los hashes diferirán.
- El ejecutor detecta la discrepancia antes de ejecutar cualquier DDL y lanza un error explícito, impidiendo la divergencia entre el código fuente y el motor PostgreSQL sin alterar datos existentes.

---

## 5. Ejecución e Idempotencia

Una vez superadas las comprobaciones de seguridad, el ejecutor invoca:
```typescript
// packages/database/src/migrate.ts:35-37
await migrate(connection.db, { migrationsFolder });
await connection.db.execute(sql`select 1`);
console.info('PostgreSQL migrations applied.');
```

### Garantía de Idempotencia:
- Ejecutar el comando `pnpm db:migrate` dos veces consecutivas sobre la misma base de datos es una operación completamente inocua e idempotente.
- Drizzle comprueba que las migraciones ya se encuentran registradas en `drizzle.__drizzle_migrations` y no repite la ejecución de las sentencias SQL.

---

## 6. Comandos Operativos de Migraciones

| Comando | Acción | Comportamiento Esperado |
|---|---|---|
| `pnpm db:generate` | Lee `packages/database/src/schema.ts` y genera un nuevo archivo `.sql` si detecta diferencias respecto al baseline. | Debe retornar `No schema changes, nothing to migrate` si el esquema TypeScript coincide con el DDL versionado. |
| `pnpm db:migrate` | Ejecuta `packages/database/src/migrate.ts`, adquiriendo el lock `72160419` y aplicando las migraciones pendientes. | Registra `PostgreSQL migrations applied.` en la salida estándar. |
