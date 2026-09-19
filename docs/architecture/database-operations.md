# Operaciones de Base de Datos y Concurrencia

Este documento detalla la gestión operativa de PostgreSQL en Rebel Crown Legacy (RCL), incluyendo mecanismos de serialización y bloqueos consultivos (Advisory Locks), configuración del pool de conexiones, control de entornos y ciclo de vida de migraciones.

Para consultar el diseño de entidades, diagramas y mapeo de partidas:
- [**Modelo y Decisiones Arquitectónicas**](database.md): Decisiones de diseño, reglas de clasificación y garantías relacionales.
- [**Esquema Relacional y Diagrama ER**](database-schema.md): Diagrama Mermaid ER de las 17 tablas, enums, checks y reglas de integridad.
- [**Mapeo de Estadísticas ROFL**](rofl-mapping.md): Correspondencia detallada de métricas JSON de repeticiones hacia tablas relacionales.

---

## Bloqueos de Concurrencia (PostgreSQL Advisory Locks)

Para garantizar la idempotencia, prevenir condiciones de carrera entre instancias y evitar la corrupción del estado de la base de datos durante despliegues o tareas de inicialización, el sistema implementa dos bloqueos consultivos explícitos a nivel de motor PostgreSQL:

### 1. Bloqueo de Migraciones: `pg_advisory_lock(72160419)`
* **Ubicación:** `packages/database/src/migrate.ts`
* **Tipo:** Bloqueo consultivo a nivel de sesión (Session-level Advisory Lock).
* **ID Numérico:** `72160419`
* **Mecanismo:**
  ```typescript
  const client = await connection.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(72160419)');
    // Verificación de desvíos en el historial y ejecución de migraciones
    await migrate(connection.db, { migrationsFolder });
  } finally {
    await client.query('SELECT pg_advisory_unlock(72160419)');
    client.release();
  }
  ```
* **Propósito:**
  - Serializa de manera estricta la ejecución de migraciones cuando múltiples réplicas o contenedores de la API inician concurrentemente.
  - Asegura que únicamente un proceso adquiera el bloqueo y ejecute los scripts DDL de `drizzle-orm/node-postgres/migrator`.
  - Comprueba antes de migrar si existe un esquema sin seguimiento (`public.seasons` presente sin la tabla de control `drizzle.__drizzle_migrations`) o si los hashes aplicados difieren de los archivos locales, abortando la ejecución para evitar sobreescrituras accidentales en bases existentes.
  - Se libera obligatoriamente en la cláusula `finally` con `pg_advisory_unlock(72160419)`.

### 2. Bloqueo de Datos Demo: `pg_advisory_xact_lock(72160420)`
* **Ubicación:** `packages/database/src/seed.ts`
* **Tipo:** Bloqueo consultivo a nivel de transacción (Transaction-level Advisory Lock).
* **ID Numérico:** `72160420`
* **Mecanismo:**
  ```typescript
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(72160420)');
  await client.query(script);
  await client.query('COMMIT');
  ```
* **Propósito:**
  - Aísla la inserción masiva de datos sintéticos de prueba (`seed/demo.sql`) dentro de una transacción atómica.
  - El bloqueo transaccional `pg_advisory_xact_lock` no requiere liberación manual; PostgreSQL lo libera de manera garantizada y atómica al finalizar la transacción, ya sea mediante `COMMIT` o `ROLLBACK`.
  - Impide que dos procesos de seeding concurrentes generen colisiones de claves primarias o violaciones de integridad referencial.

---

## Configuración del Pool de Conexiones

La factoría `createDatabase(connectionString)` en `packages/database/src/index.ts` inicializa un cliente `pg.Pool` ajustado para la resiliencia operativa y protección del servidor:

```typescript
const pool = new Pool({
  connectionString,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 10000,
  application_name: 'rcl-api'
});
```

### Parámetros del Pool:
| Parámetro | Valor | Justificación Técnica |
| --- | --- | --- |
| `max` | `10` | Límite máximo de conexiones simultáneas por proceso API, dimensionado para evitar saturar el límite `max_connections` de PostgreSQL en entornos contenerizados. |
| `connectionTimeoutMillis` | `5000` | Tiempo máximo de espera (5 s) para que un hilo de ejecución obtenga una conexión disponible del pool antes de emitir un timeout. |
| `idleTimeoutMillis` | `30000` | Las conexiones inactivas que superen 30 segundos son cerradas y desalojadas para liberar memoria y recursos en el motor. |
| `statement_timeout` | `10000` | Límite estricto de ejecución de 10 segundos por consulta SQL. Cancela consultas lentas o bloqueadas evitando el agotamiento de workers en PostgreSQL. |
| `application_name` | `'rcl-api'` | Etiqueta identificativa inyectada en cada sesión para trazabilidad inmediata en `pg_stat_activity`. |

---

## Variables de Entorno de Base de Datos

La configuración se gestiona de forma unificada desde la raíz mediante `packages/database/src/environment.ts` (`.env`):

* **`DATABASE_URL`** (Obligatoria):
  - Formato: URI de conexión estándar (ej. `postgres://rcl:rcl_dev_password@localhost:5432/rcl`).
  - Validación: El código valida que el protocolo pertenezca estrictamente a `postgres:` o `postgresql:`. Si la variable no está definida o usa un esquema no admitido, la inicialización aborta con un mensaje de error descriptivo.
* **`ALLOW_DEMO_SEED`** y **`NODE_ENV`**:
  - `ALLOW_DEMO_SEED=true`: Flag indispensable para permitir la ejecución de `pnpm db:seed`.
  - **Barrera de Producción:** Si `NODE_ENV === 'production'` o si `ALLOW_DEMO_SEED !== 'true'`, el runner de seed lanza una excepción inmediata:
    ```
    Demo seed disabled. Set ALLOW_DEMO_SEED=true in a development/test environment only.
    ```
    Esta regla bloquea de forma irreversible la inserción accidental de datos sintéticos o ficticios en bases de producción.

---

## Entornos de Ejecución: PGlite vs Docker

El proyecto desacopla los entornos de prueba local de los entornos de desarrollo integrado y producción:

### 1. PGlite (Pruebas Unitarias y de Integración)
* **Paquete:** `@electric-sql/pglite`
* **Naturaleza:** PostgreSQL real compilado a WebAssembly (WASM), ejecutado en memoria dentro del propio proceso de Node.js / Vitest.
* **Uso:** Las pruebas de integración de base de datos en `tests/integration/` utilizan PGlite. Las pruebas unitarias y de módulo se colocan junto al código que verifican.
* **Ventajas:**
  - Aislamiento total: cada prueba o suite puede desplegar un clúster limpio sin persistencia residual.
  - Velocidad instantánea: cero sobrecarga de red o arranque de contenedores Docker.
  - Cero dependencias externas: la suite se ejecuta de forma autónoma en CI y máquinas locales sin necesidad de demonios de base de datos ni sockets TCP.
  - Compatibilidad completa con Drizzle ORM y migraciones SQL estándar.

### 2. PostgreSQL persistente
* **Versión:** PostgreSQL 17.
* **Conexión:** Cada entorno configura su instancia mediante `DATABASE_URL` en `.env`.
* **Uso:** Persistencia real, inspección mediante Drizzle Studio y ejecución de la API completa con `pnpm dev:api`.
* **Configuración local:** Los archivos personales de Docker y los datos de la instancia quedan fuera del control de versiones.

---

## Operaciones y Comandos CLI

Los scripts se encuentran centralizados en el `package.json` de `packages/database` y son accesibles desde la raíz del workspace con `pnpm`:

### `pnpm db:migrate`
* **Ejecutable:** `tsx packages/database/src/migrate.ts`
* **Acción:** Adquiere `pg_advisory_lock(72160419)`, comprueba la consistencia del historial frente a `drizzle.__drizzle_migrations`, aplica las migraciones SQL pendientes desde `packages/database/drizzle/` y ejecuta un ping de salud (`SELECT 1`).

### `pnpm db:seed`
* **Ejecutable:** `tsx packages/database/src/seed.ts`
* **Acción:** Comprueba que `NODE_ENV !== 'production'` y `ALLOW_DEMO_SEED === 'true'`. Abre una transacción con `pg_advisory_xact_lock(72160420)` y ejecuta `packages/database/seed/demo.sql`.

### `pnpm db:check`
* **Ejecutable:** `tsx packages/database/src/check.ts`
* **Acción:** Realiza una consulta diagnóstica que imprime el nombre de la base conectada, usuario activo y versión de PostgreSQL, seguido de una tabla con todas las tablas existentes en el esquema `public`.

### `pnpm db:studio`
* **Ejecutable:** `drizzle-kit studio`
* **Acción:** Inicia el servidor web local de Drizzle Studio para explorar y editar registros mediante una interfaz gráfica de usuario en el navegador.

### `pnpm db:generate`
* **Ejecutable:** `drizzle-kit generate`
* **Acción:** Compara las definiciones de `packages/database/src/schema.ts` contra los snapshots previos y genera una nueva migración SQL diferencial en `packages/database/drizzle/`.
