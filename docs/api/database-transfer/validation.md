# Validación y Seguridad Operativa: Database Transfer API

[⬅️ Volver a Persistencia](persistence.md) | [Siguiente: Contratos y DTOs ➡️](contracts.md)

---

## 1. Resumen de la Capa de Validación

La validación del módulo de transferencias de base de datos (`apps/api/src/modules/database-transfer/`) aplica filtros estrictos a nivel de transporte binario, formato de volcado, integridad de esquemas relacionales y matriz de privilegios por rol.

Debido a que la restauración física de una base de datos es una operación de máximo impacto destructivo, el sistema descarta cualquier volcado que presente la más mínima divergencia con el estado esperado de la aplicación.

---

## 2. Validación de Formato y Estructura Binaria

### 2.1 Inspección de Bytes Mágicos (`PGDMP`)
- **Cita:** `postgres-backup-tools.ts:83`
- **Mecanismo:** Antes de delegar el archivo al motor de lectura, se inspeccionan los primeros 5 bytes del búfer:
  ```typescript
  if (backup.subarray(0, 5).toString('ascii') !== 'PGDMP') {
    throw new AppError(422, 'INVALID_BACKUP', 'The backup file is not a valid PostgreSQL custom dump.');
  }
  ```
  Esto rechaza inmediatamente archivos de texto plano SQL, scripts bash, imágenes o archivos comprimidos incorrectos.

### 2.2 Límites de Carga Útil en Memoria (64 MiB)
- **Cita:** `database-transfer.service.ts:5, 22-28`
- **Mecanismo:** El servicio impone el límite constante `MAX_DATABASE_BACKUP_BYTES = 64 * 1024 * 1024` (64 MiB):
  - Si el búfer entrante tiene longitud 0, lanza `AppError(422, 'INVALID_BACKUP', 'The backup file is empty.')`.
  - Si el búfer supera los 64 MiB, lanza `AppError(413, 'PAYLOAD_TOO_LARGE', 'The backup exceeds the 64 MiB limit.')`.

---

## 3. Compatibilidad de Esquemas y Paridad de Columnas

### 3.1 Verificación de Columnas en Bloques `COPY`
- **Cita:** `postgres-copy-backup.ts:40-47`
- **Mecanismo:** Al analizar cada bloque `COPY table (col1, col2, ...) FROM stdin;`:
  1. Extrae la lista de columnas declaradas en el volcado.
  2. Obtiene las columnas configuradas en la tabla Drizzle actual (`expectedColumns`).
  3. Si una columna falta, sobra o cambia de orden relativo respecto al modelo activo, el analizador interrumpe el procesamiento con HTTP 422 `INCOMPATIBLE_BACKUP`.

### 3.2 Paridad del Historial de Migraciones
- **Cita:** `postgres-database-transfer.repository.ts:215-229`
- **Mecanismo:** La tabla `drizzle.__drizzle_migrations` almacena la secuencia histórica de migraciones aplicadas.
  - El volcado debe contener exactamente el mismo conjunto de migraciones (mismos hashes SHA-256 y marcas de tiempo).
  - Si el volcado procede de una versión anterior o posterior del código fuente, la importación se rechaza para evitar desajustes estructurales.

---

## 4. Validación de Tokens Criptográficos de Confirmación

- **Cita:** `database-transfer.service.ts:31-34`
- **Mecanismo:** El método `importDatabase` valida que el token provisto en la cabecera `X-Import-Confirmation` sea una cadena hexadecimal de 64 caracteres mediante Zod:
  ```typescript
  const confirmationSchema = z.string().regex(/^[a-f0-9]{64}$/);
  ```
- Si la confirmación no supera la expresión regular, se arroja HTTP 422 `VALIDATION_ERROR`.
- Posteriormente, el repositorio verifica que el token coincida con el hash generado durante la simulación previa (`prepared.preview.confirmation === confirmation`). Si discrepan, devuelve HTTP 409 `IMPORT_PREVIEW_CHANGED`.

---

## 5. Matriz de Privilegios y Restricciones por Rol

| Operación | Rol `viewer` | Rol `admin` | Rol `owner` | Justificación de Seguridad |
|---|:---:|:---:|:---:|---|
| `POST /export` (Descargar dump) | ❌ 403 | ✅ 200 | ✅ 200 | Respaldos para análisis o archivo histórico. |
| `POST /import-preview` (Simulación) | ❌ 403 | ❌ 403 | ✅ 200 | **Solo `owner`**: simulación de restauración en dos fases. |
| `POST /import` (Restaurar) | ❌ 403 | ❌ 403 | ✅ 200 | **Solo `owner`**: sustitución destructiva de toda la base de datos. |

### Restricciones y Alcance de la Transferencia de Base de Datos
- Un usuario con rol `admin` tiene autorización para descargar copias de seguridad de la competición (`POST /export`).
- Sin embargo, un usuario con rol `admin` **NO TIENE PERMITIDO** subir o previsualizar volcados (`POST /import-preview` y `POST /import`).
- Si un `admin` intenta acceder a los endpoints de importación, el middleware `requireAuth(auth, 'owner')` (`database-transfer.router.ts:25`) intercepta la petición y responde con HTTP 403 `FORBIDDEN`.
- La restauración de base de datos queda así reservada exclusivamente al propietario máximo de la plataforma.
