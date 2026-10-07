# Módulo API: Database Transfer & Backup Operations

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Web CRUD Operations ➡️](../../../docs/web/crud-operations/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/database-transfer/` implementa el subsistema de exportación binaria, validación previa y restauración atómica de la base de datos PostgreSQL de RCL-Next. Proporciona herramientas de copia de seguridad integrales que garantizan la portabilidad del estado de la competición deportiva y protegen la infraestructura contra corrupciones de esquema, pérdida de sesiones y ataques de inyección SQL en volcados.

El motor de transferencia se rige por cinco pilares fundamentales de seguridad y fiabilidad:

1. **Exclusión Mutua Concurrente Multicapa:** Bloqueo en memoria a nivel de proceso (`database-transfer.service.ts:7-18`) combinado con bloqueo consultivo transaccional en PostgreSQL (`pg_advisory_xact_lock(72160419)`, `postgres-database-transfer.repository.ts:131`), evitando que dos operaciones de transferencia se solapen o degraden el motor relacional.
2. **Aislamiento Estricto de Procesos Nativos:** La exportación excluye las filas de `auth_sessions` y `oauth_states` y queda registrada en `audit_logs` (`database-transfer.export`). Utiliza `pg_dump` mediante `child_process.spawn` aislado sin invocación de shells del sistema (`shell: false`, `windowsHide: true`), transmitiendo credenciales exclusivamente mediante variables de entorno efímeras (`PGPASSWORD`) y aplicando un temporizador estricto de 3 minutos (`postgres-backup-tools.ts:27-50`). La salida de `pg_dump --format=custom` se acumula en memoria (hasta 64 MiB) y se envía completa cuando el proceso termina (`postgres-backup-tools.ts:44-85`, `database-transfer.router.ts:18-24`); no hay compresión adicional ni envío por partes: la única compresión es la propia del formato custom.
3. **Inmunidad contra Inyecciones SQL en Volcados:** El analizador de respaldo (`postgres-copy-backup.ts:28-71`) descarta de plano cualquier sentencia SQL arbitraria (`DROP TABLE`, `CREATE FUNCTION`, `ALTER USER`). Únicamente analiza y extrae bloques tabulados `COPY ... FROM stdin;` que coincidan exactamente con las columnas y esquemas declarados en Drizzle ORM.
4. **Simulación de Restauración en Dos Fases (`SAVEPOINT`):** La validación de importación (`POST /import-preview`) ejecuta una restauración simulada completa dentro de una transacción con `SAVEPOINT validate_backup`, verificando integridad referencial, restricciones diferidas (`SET CONSTRAINTS ALL IMMEDIATE`) y compatibilidad del historial de migraciones, antes de revertir inmediatamente con `ROLLBACK TO SAVEPOINT` (`postgres-database-transfer.repository.ts:262-271`).
5. **Revocación Universal de Sesiones y Protección del Owner:** Tras una restauración física definitiva, se purgan de inmediato todas las sesiones activas (`schema.authSessions`) y estados OAuth (`schema.oauthStates`). Como salvaguarda crítica, el usuario con rol `owner` que ejecuta la operación es reinsertado y reasignado como `owner` forzoso mediante `onConflictDoUpdate` (`postgres-database-transfer.repository.ts:166-169`), impidiendo que un backup desactualizado bloquee al administrador fuera de su propia plataforma.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Capa de Transporte** | [routes.md](routes.md) | Endpoints de exportación binaria (`POST /export`), previsualización de volcado (`POST /import-preview`) y restauración confirmada (`POST /import`); cuerpos binarios completos en memoria con límite de 64 MiB. |
| **Lógica de Procesamiento** | [processing.md](processing.md) | Cerrojo de exclusión mutua, parser de secuencias COPY, decodificación de caracteres de escape y simulación transaccional con `SAVEPOINT`. |
| **Persistencia Relacional y Restauración** | [persistence.md](persistence.md) | Implementación de `PostgresDatabaseTransferRepository`, orden topológico de inserción, validación de migraciones y protección anti-desalojo del owner. |
| **Validación y Seguridad Operativa** | [validation.md](validation.md) | Validación de cabecera mágica `PGDMP`, paridad de columnas en tablas Drizzle, token SHA-256 de confirmación y matriz de privilegios `admin` vs `owner`. |
| **Contratos y DTOs Compartidos** | [contracts.md](contracts.md) | Interfaces TypeScript exportadas (`DatabaseImportTable`, `DatabaseImportPreview`, `DatabaseImportResult`) en `@rcl/contracts`. |

---

## 3. Garantías de Fiabilidad y Reglas de Dominio

- **Matriz de Privilegios Asimétrica:** La exportación está permitida tanto a administradores como a propietarios (`admin` y `owner`). Por el contrario, la importación física y la previsualización de restauración están restringidas de forma infranqueable al rol **`owner`** (`database-transfer.router.ts:25`).
- **Límite Rígido de Memoria de Carga Útil:** La transferencia web admite volcados de hasta **64 MiB** (`MAX_DATABASE_BACKUP_BYTES = 64 * 1024 * 1024`). Un archivo vacío se rechaza con HTTP 422 `INVALID_BACKUP` y uno que excede este tamaño con HTTP 413 `PAYLOAD_TOO_LARGE` (`database-transfer.service.ts:22-28`). Una exportación cuya salida supera el límite se interrumpe con HTTP 413 `BACKUP_TOO_LARGE` (`postgres-backup-tools.ts:51-61`).
- **Limpieza de Archivos Temporales POSIX:** Todos los archivos de respaldo intermedios se escriben en directorios temporales aislados con permisos restrictivos `0o600` y se eliminan sistemáticamente en bloques `finally` mediante `rm(..., { recursive: true, force: true })`.
