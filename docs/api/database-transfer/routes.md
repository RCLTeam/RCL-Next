# Rutas y Capa de Transporte: Database Transfer API

[⬅️ Volver a la Documentación del Módulo](README.md) | [Siguiente: Lógica de Procesamiento ➡️](processing.md)

---

## 1. Resumen de la Capa de Transporte

El enrutador de transferencias de base de datos (`apps/api/src/modules/database-transfer/database-transfer.router.ts:8-42`) se monta bajo el prefijo `/api/v1/database-transfer`. Gestiona el flujo binario de exportación e importación de volcados de PostgreSQL, aplicando controles asimétricos de acceso por rol y parseo seguro de flujos binarios crudos (`application/octet-stream`).

### Cabeceras Defensivas y Límites de Carga Útil
- **Inhabilitación de Caché:** Inyecta `Cache-Control: no-store` (`database-transfer.router.ts:13-15`) en todas las respuestas para evitar que volcados o estados de previsualización se conserven en intermediarios.
- **Transmisión Binaria Cruda:** Utiliza el parser `raw(...)` de Express configurado con `limit: MAX_DATABASE_BACKUP_BYTES` (64 MiB) y descompresión automática deshabilitada (`inflate: false`), garantizando que la memoria de proceso de Node.js reciba los bytes del volcado exactamente como fueron generados.

---

## 2. Catálogo de Endpoints

### 2.1 Exportar Base de Datos Completa

- **Ruta:** `POST /api/v1/database-transfer/export`
- **Controlador:** `database-transfer.router.ts:18-24`
- **Autenticación requerida:** Rol `admin` o `owner` (`requireAuth(auth, 'admin')` + `requireTrustedOrigin`).
- **Parámetros de entrada:** Ninguno.
- **Comportamiento:**
  1. Adquiere el cerrojo de exclusión mutua `service.exclusive(...)`.
  2. Ejecuta `pg_dump` con argumentos optimizados (`--format=custom`, `--schema=public`, `--schema=drizzle`).
  3. Establece la cabecera `Content-Type: application/octet-stream`.
  4. Establece la cabecera `Content-Disposition: attachment; filename="rcl-YYYY-MM-DDTHH-MM-SS.sssZ.dump"`.
  5. Envía el búfer binario directamente al cliente.
- **Respuesta exitosa (HTTP 200 OK):** Secuencia binaria del volcado custom de PostgreSQL.

---

### 2.2 Previsualizar Importación de Volcado (Simulación)

- **Ruta:** `POST /api/v1/database-transfer/import-preview`
- **Controlador:** `database-transfer.router.ts:29-31`
- **Autenticación requerida:** **Exclusivamente rol `owner`** (`requireAuth(auth, 'owner')`).
- **Cuerpo de la petición:** Búfer binario crudo (`application/octet-stream`) del archivo `.dump` (hasta 64 MiB).
- **Comportamiento Específico:**
  - Un usuario con rol `admin` es rechazado con HTTP 403 `FORBIDDEN`.
  - Verifica los bytes mágicos `PGDMP`.
  - Desempaqueta y parsea los bloques `COPY`.
  - Inicia una transacción con `SAVEPOINT validate_backup`, inserta los datos para validar integridad referencial y restricciones diferidas, y ejecuta `ROLLBACK TO SAVEPOINT`.
  - Computa y devuelve un token criptográfico SHA-256 de confirmación junto con el desglose de filas actuales vs. importadas para cada una de las 21 tablas relacionales.
- **Respuesta exitosa (HTTP 200 OK):**
  ```json
  {
    "data": {
      "confirmation": "c3d82a1f...64hexChars",
      "exportedAt": "2026-09-30T19:00:00.000Z",
      "tables": [
        {
          "table": "seasons",
          "currentRows": 2,
          "importedRows": 2
        },
        {
          "table": "discord_users",
          "currentRows": 45,
          "importedRows": 50
        }
      ]
    }
  }
  ```

---

### 2.3 Ejecutar Importación Definitiva

- **Ruta:** `POST /api/v1/database-transfer/import`
- **Controlador:** `database-transfer.router.ts:32-40`
- **Autenticación requerida:** **Exclusivamente rol `owner`**.
- **Cabeceras obligatorias:**
  - `Content-Type: application/octet-stream`
  - `X-Import-Confirmation`: Token criptográfico SHA-256 devuelto previamente por `/import-preview`.
- **Cuerpo de la petición:** Mismo archivo binario validado en la previsualización.
- **Comportamiento:**
  1. Verifica que la cabecera `X-Import-Confirmation` sea un hash hexadecimal de 64 caracteres.
  2. Valida que el volcado y el estado actual de base de datos coincidan exactamente con la previsualización (`prepared.preview.confirmation === confirmation`). Si discrepan, aborta con HTTP 409 `IMPORT_PREVIEW_CHANGED`.
  3. Aplica `TRUNCATE TABLE` sobre todas las tablas en orden inverso.
  4. Inserta las nuevas filas respetando el orden topológico de claves foráneas.
  5. Revoca todas las sesiones y estados OAuth (`auth_sessions`, `oauth_states`).
  6. Preserva el rol del usuario `owner` actuante mediante `onConflictDoUpdate`.
  7. Registra la auditoría en `schema.auditLogs` con la acción `database-transfer.import`.
- **Respuesta exitosa (HTTP 200 OK):**
  ```json
  {
    "data": {
      "importedAt": "2026-09-30T20:30:15.000Z"
    }
  }
  ```

---

## 3. Catálogo de Errores y Códigos de Estado

| Código HTTP | Código Interno (`error.code`) | Causa Fisiológica |
|---|---|---|
| **401 Unauthorized** | `UNAUTHORIZED` | Ausencia de credenciales válidas o sesión expirada. |
| **403 Forbidden** | `FORBIDDEN` | Usuario con rol `admin` intentando previsualizar o ejecutar una importación. |
| **409 Conflict** | `DATABASE_BUSY` | Otra operación de transferencia está en ejecución simultáneamente. |
| **409 Conflict** | `IMPORT_PREVIEW_CHANGED` | La base de datos o el archivo variaron entre la previsualización y la confirmación. |
| **413 Payload Too Large** | `PAYLOAD_TOO_LARGE` | El volcado supera el límite estricto de 64 MiB (`MAX_DATABASE_BACKUP_BYTES`). |
| **422 Unprocessable** | `INVALID_BACKUP` | El archivo no comienza con la firma binaria requerida `PGDMP`. |
| **422 Unprocessable** | `INCOMPATIBLE_BACKUP` | Las columnas del volcado o el historial de migraciones (`drizzle.__drizzle_migrations`) difieren del esquema activo. |
| **422 Unprocessable** | `INVALID_BACKUP_DATA` | Violación de restricciones relacionales o tipos inválidos durante la carga de filas. |
| **503 Unavailable** | `POSTGRES_TOOLS_UNAVAILABLE` | Las utilidades del sistema `pg_dump` o `pg_restore` no están instaladas o no se encuentran en `POSTGRES_BIN_DIR`. |
| **504 Gateway Timeout** | `BACKUP_TIMEOUT` | La ejecución de `pg_dump` o `pg_restore` excedió el límite operativo de 180 segundos. |
