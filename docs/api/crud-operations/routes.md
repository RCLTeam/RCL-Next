# Rutas y Capa de Transporte: CRUD Operations API

[⬅️ Volver a la Documentación del Módulo](README.md) | [Siguiente: Lógica de Procesamiento ➡️](processing.md)

---

## 1. Resumen de la Capa de Transporte

El enrutador de operaciones CRUD (`apps/api/src/modules/crud-operations/crud-operations.router.ts:5-46`) se monta bajo el prefijo `/api/v1/crud-operations`. Centraliza la exposición de las entidades relacionales de la competición deportiva, aplicando defensas perimetrales de seguridad en cada solicitud.

### Cabeceras Defensivas y Autenticación Centralizada
- **Inhabilitación de Caché:** Todas las rutas del enrutador inyectan `Cache-Control: no-store` (`crud-operations.router.ts:7-9`), impidiendo que respuestas administrativas o metadatos de recursos se almacenen en cachés compartidas o de navegador.
- **Control Perimetral de Acceso:** Se aplica el middleware `requireAuth(auth, 'admin')` (`crud-operations.router.ts:11`) a la totalidad del enrutador. Los usuarios no autenticados o con rol espectador (`viewer`) son rechazados de forma inmediata con HTTP 401 o HTTP 403.
- **Protección Antifalsificación (CSRF):** Antes de registrar los endpoints de mutación (`/delete-preview`, `POST`, `PUT`, `DELETE`), se interpone `requireTrustedOrigin(auth.frontendOrigin)` (`crud-operations.router.ts:19`), verificando que la cabecera `Origin` coincida con el dominio del cliente web.

---

## 2. Catálogo de Endpoints

### 2.1 Obtener Catálogo de Recursos CRUD

- **Ruta:** `GET /api/v1/crud-operations/resources`
- **Controlador:** `crud-operations.router.ts:12`
- **Autenticación requerida:** Rol `admin` o `owner`.
- **Parámetros de entrada:** Ninguno.
- **Respuesta exitosa (HTTP 200 OK):**
  ```json
  {
    "data": [
      {
        "name": "seasons",
        "label": "Temporadas",
        "description": "Ediciones anuales de la competición.",
        "keys": ["id"],
        "fields": [...]
      },
      ...
    ]
  }
  ```

---

### 2.2 Listar Opciones de Referencia Foránea

- **Ruta:** `GET /api/v1/crud-operations/references/:resource`
- **Controlador:** `crud-operations.router.ts:13-15`
- **Autenticación requerida:** Rol `admin` o `owner`.
- **Parámetros de ruta:**
  - `:resource` (`string`): Nombre del recurso (`seasons`, `divisions`, `competitions`, `teams`, `users`, etc.).
- **Parámetros de query string:**
  - `search` (`string`, opcional): Texto de filtrado.
  - `offset` (`number`, opcional, por defecto 0): Desplazamiento paginado.
- **Comportamiento:** Invoca `service.list(resource, query, true)`, habilitando el flag `forReference` para resolver identificadores y etiquetas legibles (`recordLabel`) requeridas en selectores desplegables de formularios.

---

### 2.3 Listar Registros con Búsqueda y Paginación

- **Ruta:** `GET /api/v1/crud-operations/:resource`
- **Controlador:** `crud-operations.router.ts:16-18`
- **Autenticación requerida:** Rol `admin` o `owner`.
- **Parámetros de ruta:**
  - `:resource` (`string`): Identificador del recurso mutable.
- **Parámetros de query string:**
  - `search` (`string`, opcional): Término de búsqueda textual.
  - `offset` (`number`, opcional, por defecto 0): Índice de inicio para la paginación.
- **Respuesta exitosa (HTTP 200 OK):**
  ```json
  {
    "data": {
      "records": [
        {
          "id": 1,
          "name": "Temporada 2026",
          "split": "split1",
          "updatedAt": "2026-03-15T12:00:00.000000Z"
        }
      ],
      "hasMore": false
    }
  }
  ```

---

### 2.4 Previsualizar Borrado en Cascada

- **Ruta:** `POST /api/v1/crud-operations/:resource/delete-preview`
- **Controlador:** `crud-operations.router.ts:20-28`
- **Autenticación requerida:** Rol `admin` o `owner` (`requireAuth` + `requireTrustedOrigin`).
- **Cuerpo de la petición (JSON):**
  ```json
  {
    "key": { "id": 1 },
    "version": "2026-03-15T12:00:00.000000Z"
  }
  ```
- **Comportamiento Específico:**
  - Tanto `admin` como `owner` pueden invocar la previsualización (`purpose === 'preview'`).
  - El motor bloquea la fila del actor con `lockDeletePlan(tx, actorId, 'preview')` mediante `noWait: true`.
  - Recorre el grafo de claves foráneas y calcula los registros afectados.
  - Si no hay bloqueos por restricciones `RESTRICT` o `NOT NULL`, retorna `allowed: true` junto con el hash SHA-256 de confirmación (`confirmation`).
- **Respuesta exitosa (HTTP 200 OK):**
  ```json
  {
    "data": {
      "confirmation": "a4f89b7c...64hexChars",
      "allowed": true,
      "impacts": [
        {
          "table": "seasons_divisions",
          "action": "delete",
          "count": 3,
          "examples": [{ "idSeason": 1, "idDivision": 1 }]
        }
      ]
    }
  }
  ```

---

### 2.5 Crear Registro

- **Ruta:** `POST /api/v1/crud-operations/:resource`
- **Controlador:** `crud-operations.router.ts:34-43`
- **Autenticación requerida:** Rol `admin` o `owner` (`requireTrustedOrigin`).
- **Cuerpo de la petición (JSON):** Valores del nuevo registro conforme al esquema Zod del recurso.
- **Respuesta exitosa (HTTP 201 Created):**
  ```json
  {
    "data": {
      "id": 2,
      "name": "Temporada 2027",
      "updatedAt": "2026-09-30T20:00:00.123456Z"
    }
  }
  ```

---

### 2.6 Actualizar Registro (Concurrencia Optimista)

- **Ruta:** `PUT /api/v1/crud-operations/:resource`
- **Controlador:** `crud-operations.router.ts:34-43`
- **Autenticación requerida:** Rol `admin` o `owner` (`requireTrustedOrigin`).
- **Cuerpo de la petición (JSON):**
  ```json
  {
    "key": { "id": 1 },
    "version": "2026-03-15T12:00:00.000000Z",
    "values": {
      "name": "Temporada 2026 Actualizada"
    }
  }
  ```
- **Comportamiento:** Compara `version` contra el `updatedAt` actual en base de datos. Si difieren, aborta con HTTP 409 `DATA_CONFLICT`.
- **Respuesta exitosa (HTTP 200 OK):** Registro actualizado con su nueva versión temporal.

---

### 2.7 Eliminar Registro en Cascada

- **Ruta:** `DELETE /api/v1/crud-operations/:resource`
- **Controlador:** `crud-operations.router.ts:34-43`
- **Autenticación requerida:** **Exclusivamente rol `owner`**.
- **Cuerpo de la petición (JSON):**
  ```json
  {
    "key": { "id": 1 },
    "version": "2026-03-15T12:00:00.000000Z",
    "cascadeConfirmation": "a4f89b7c...64hexChars"
  }
  ```
- **Comportamiento Específico:**
  - Si un usuario con rol `admin` intenta ejecutar esta ruta, la línea 112 de `postgres-crud-delete-plan.ts` arroja HTTP 403 `FORBIDDEN`:
    `Only an owner can delete related data.`
  - Si el registro posee dependencias y no se suministra `cascadeConfirmation`, o si existen impactos con acción `'blocked'`, la eliminación se rechaza con HTTP 409 `RELATED_RECORDS`.
  - Si se suministra `cascadeConfirmation` pero el grafo cambió, se rechaza con HTTP 409 `DELETE_PREVIEW_CHANGED`.
- **Respuesta exitosa:** `HTTP 204 No Content` (sin cuerpo).

---

## 3. Catálogo de Respuestas de Error

| Código HTTP | Código Interno (`error.code`) | Causa Fisiológica |
|---|---|---|
| **401 Unauthorized** | `UNAUTHORIZED` | Ausencia de cookie de sesión válida o expirada. |
| **403 Forbidden** | `FORBIDDEN` | Usuario con rol insuficiente (ej. `admin` intentando un borrado destructivo). |
| **404 Not Found** | `NOT_FOUND` | Recurso no existente en el catálogo, o intento de mutar `users`. |
| **409 Conflict** | `DATA_CONFLICT` | Colisión de concurrencia optimista (`version !== updatedAt`) o bloqueo concurrente (`55P03`). |
| **409 Conflict** | `DELETE_PREVIEW_CHANGED` | El grafo de dependencias cambió entre la previsualización y la confirmación. |
| **409 Conflict** | `RELATED_RECORDS` | Existen entidades dependientes bloqueantes (`action: 'blocked'`). |
| **422 Unprocessable** | `DELETE_TOO_LARGE` | El borrado acumulado supera el límite operativo duro de 10.000 filas. |
| **422 Unprocessable** | `INVALID_DATES` | En `seasons`, fecha de fin anterior a fecha de inicio (`endsOn < startsOn`). |
| **422 Unprocessable** | `VALIDATION_ERROR` | Los datos no superan el esquema Zod del recurso (campos obligatorios o formatos inválidos). |
