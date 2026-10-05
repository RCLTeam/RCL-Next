# Lógica de Procesamiento y Streaming: Database Transfer API

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Persistencia Relacional ➡️](persistence.md)

---

## 1. Resumen de la Capa de Procesamiento

La capa de procesamiento del módulo de transferencias (`apps/api/src/modules/database-transfer/database-transfer.service.ts`, `postgres-backup-tools.ts` y `postgres-copy-backup.ts`) es responsable de coordinar la exclusión mutua, gestionar los procesos secundarios de respaldo, analizar los flujos de texto tabular `COPY` de PostgreSQL y ejecutar simulaciones transaccionales en dos fases.

---

## 2. Cerrojo de Exclusión Mutua en Proceso (`exclusive`)

Para evitar la concurrencia descontrolada de operaciones de lectura/escritura masivas sobre la base de datos:

- **Cita:** `database-transfer.service.ts:7-18`
- **Mecanismo:** La clase `DatabaseTransferService` implementa un semáforo booleano interno:
  ```typescript
  private running = false;

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.running) {
      throw new AppError(409, 'DATABASE_BUSY', 'Another database transfer is running.');
    }
    this.running = true;
    try {
      return await operation();
    } finally {
      this.running = false;
    }
  }
  ```
- Cualquier petición entrante (`exportDatabase`, `previewImport`, `importDatabase`) que intente ejecutarse mientras otra transferencia está activa es rechazada inmediatamente con HTTP 409 `DATABASE_BUSY`.

---

## 3. Aislamiento y Ejecución Segura de Procesos Nativos (`postgres-backup-tools.ts`)

La interacción con los binarios del motor de base de datos se realiza bajo estrictas directrices de seguridad de infraestructura:

### 3.1 Prevención Total de Inyección de Comandos Shell
- **Cita:** `postgres-backup-tools.ts:25-41`
- **Mecanismo:** La invocación de `pg_dump` y `pg_restore` utiliza `child_process.spawn` configurando de forma forzosa:
  ```typescript
  spawn(binary, args, {
    shell: false,
    windowsHide: true,
    env: { ...process.env, PGPASSWORD: password }
  });
  ```
  Al desactivar el intérprete de comandos (`shell: false`), los argumentos se transmiten directamente al ejecutable en el kernel del sistema operativo, eliminando cualquier vector de inyección de comandos shell a través de nombres o parámetros.

### 3.2 Protección de Credenciales y Parámetros de Volcado
- Las contraseñas de conexión jamás se pasan en la línea de comandos (donde serían visibles mediante herramientas como `ps` o `/proc`). Se transmiten únicamente a través de la variable de entorno protegida `PGPASSWORD`.
- `pg_dump` se ejecuta con `--no-password` e incluye de forma selectiva únicamente los esquemas de la aplicación:
  `--format=custom`, `--no-owner`, `--no-privileges`, `--schema=public`, `--schema=drizzle`, `--no-publications`, `--no-subscriptions`, `--no-security-labels`, `--exclude-table-data=public.auth_sessions` y `--exclude-table-data=public.oauth_states` (`postgres-backup-tools.ts:96-111`).
- Las tablas sin datos exportados se declaran en `EXCLUDED_DATA_TABLES` (`postgres-backup-tools.ts:9`). Sus filas (hash del token de cada sesión, estados OAuth pendientes) nunca se reutilizan, porque la restauración las elimina; el volcado conserva su definición para que la estructura restaurada no cambie.

### 3.3 Aislamiento Temporal y Limpieza Garantizada
- En operaciones de lectura y restauración (`readDump`), se valida primero la cabecera binaria mágica:
  `backup.subarray(0, 5).toString('ascii') === 'PGDMP'`. Si no coincide, lanza HTTP 422 `INVALID_BACKUP`.
- Se genera un directorio efímero mediante `mkdtemp(join(tmpdir(), 'rcl-database-transfer-'))`.
- El archivo de volcado se escribe con permisos POSIX restrictivos `0o600` (solo lectura/escritura para el propietario del proceso).
- En el bloque `finally`, se purga físicamente el directorio temporal mediante:
  `await rm(directory, { recursive: true, force: true });`.
- Se impone un temporizador de seguridad de 180.000 ms (3 minutos). Si el proceso se excede, se ejecuta `child.kill()` y se arroja HTTP 504 `BACKUP_TIMEOUT`.

---

## 4. Analizador Estricto de Bloques COPY (`postgres-copy-backup.ts`)

Para evitar ejecutar volcados SQL arbitrarios que pudieran contener instrucciones maliciosas (`DROP TABLE`, `CREATE FUNCTION`, `ALTER USER`, o comandos de cliente `\!`):

### 4.1 Inmunidad Frente a Inyecciones SQL en Volcados
- **Cita:** `postgres-copy-backup.ts:28-66`
- **Mecanismo:** El analizador **ignora por completo cualquier sentencia DDL o DML arbitraria**. Únicamente busca líneas que coincidan con la expresión regular:
  ```typescript
  const copyHeaderRegex = /^COPY (?:"?(public|drizzle)"?)\."?([a-z_][a-z0-9_]*)"? \((.+)\) FROM stdin;$/;
  ```
- Extrae el nombre de la tabla y las columnas declaradas.
- Compara las columnas extraídas contra las columnas esperadas en el esquema actual de Drizzle (`expectedColumns`). Si las columnas del volcado no coinciden con exactitud quirúrgica con el modelo de datos activo, la importación se aborta con HTTP 422 `INCOMPATIBLE_BACKUP`.
- Lee los registros tabulados fila por fila hasta detectar el delimitador de cierre de bloque `\.`.
- Cada tabla esperada debe aparecer una sola vez. Las tablas indicadas en el parámetro `optional` (`postgres-copy-backup.ts:31-35, 68-69`) pueden faltar; si aparecen, sus columnas se validan igual. El repositorio declara opcionales `public.auth_sessions` y `public.oauth_states` y descarta sus filas aunque un volcado anterior las incluya (`postgres-database-transfer.repository.ts:39-53`).

### 4.2 Decodificación de Secuencias de Escape PostgreSQL (`decodeCopyValue`)
- **Cita:** `postgres-copy-backup.ts:9-26`
- **Mecanismo:** Procesa los valores tabulares delimitados por tabuladores (`\t`):
  - La secuencia `\N` se transforma al valor primitivo `null`.
  - Decodifica secuencias octales (`\000` a `\377`) y secuencias hexadecimales (`\x00` a `\xFF`).
  - Convierte secuencias de control estándar: `\t` (tabulador), `\n` (salto de línea), `\r` (retorno de carro), `\b` (retroceso), `\f` (avance de página), `\v` (tabulación vertical) y `\\` (barra invertida literal).

---

## 5. Simulación Transaccional en Dos Fases (`SAVEPOINT`)

La validación de un volcado (`previewImport`) certifica que los datos se ajusten a todas las restricciones de integridad antes de realizar cualquier cambio visible:

1. **Adquisición de Bloqueos:** Adquiere un bloqueo consultivo transaccional en PostgreSQL (`pg_advisory_xact_lock(72160419)`) y bloquea todas las tablas involucradas en modo exclusivo (`LOCK TABLE ... IN ACCESS EXCLUSIVE MODE NOWAIT`).
2. **Timeout de Sentencia:** Configura `SET LOCAL statement_timeout = '60s'` para prevenir bloqueos residuales en caso de análisis pesados.
3. **Punto de Retorno:** Establece un punto de salvaguarda:
   ```sql
   SAVEPOINT validate_backup;
   ```
4. **Ejecución Simulada:** Trunca las tablas, inserta los registros por lotes mediante `jsonb_populate_recordset` respetando el orden topológico de claves foráneas y fuerza la verificación inmediata de restricciones diferidas:
   ```sql
   SET CONSTRAINTS ALL IMMEDIATE;
   ```
5. **Reversión Inmediata:** Deshace todos los cambios simulados:
   ```sql
   ROLLBACK TO SAVEPOINT validate_backup;
   ```
6. **Generación del Token Criptográfico:** Si la simulación concluyó con éxito, computa un hash SHA-256 vinculando el contenido del archivo, el identificador del usuario actuante y los recuentos de filas resultantes.
