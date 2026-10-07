# Rutas HTTP: Editorial Home Content & Team of the Week

[⬅️ Volver a API Home Content](README.md) | [Siguiente: Procesamiento ➡️](processing.md)

---

## 1. Visión General y Montaje del Enrutador

El enrutador de contenido editorial y selecciones semanales se instancia mediante la función factoría `homeContentRouter(service, auth, images)` en `apps/api/src/modules/home-content/home-content.router.ts:7-11`. Se monta en el pipeline principal de Express (`apps/api/src/app.ts:75-82`) bajo el prefijo canónico `/api/v1/home-content`:

```typescript
// apps/api/src/app.ts:75-82
if (options.homeContentRepository) {
  const images = new EditorialImageStore(options.editorialImageDirectory);
  app.use(
    '/api/v1/home-content',
    homeContentRouter(
      new HomeContentService(options.homeContentRepository, images),
      options.auth,
      images
    )
  );
}
```

### Cabeceras Globales
- **Control de Caché:** Todas las rutas del enrutador inyectan la directiva HTTP `Cache-Control: no-store` (`home-content.router.ts:13-16`), garantizando que ni los navegadores ni las capas intermedias almacenen respuestas en caché que pudieran entregar artículos o quintetos desactualizados.
- **Protección MIME en Imágenes:** La entrega de archivos estáticos inyecta explícitamente `X-Content-Type-Options: nosniff` (`home-content.router.ts:18`), evitando que los navegadores interpreten imágenes como scripts mediante deducción de tipo.

---

## 2. Catálogo Canónico de Endpoints

A continuación se detalla la matriz completa de las 15 rutas gestionadas por el módulo:

| # | Método | Ruta Relativa | Acceso / Autorización | Controlador / Acción | Ubicación en Router |
|:---:|:---:|---|---|---|---|
| 1 | `GET` | `/images/:name` | Público | `res.sendFile(images.path(req.params.name))` | `home-content.router.ts:17-22` |
| 2 | `GET` | `/articles` | Público | `service.listArticles()` | `home-content.router.ts:23` |
| 3 | `GET` | `/articles/:id` | Público | `service.article(req.params.id)` | `home-content.router.ts:24-26` |
| 4 | `GET` | `/weekly-teams/:id/rounds` | Público | `service.listWeeklyTeams(req.params.id)` | `home-content.router.ts:27-29` |
| 5 | `GET` | `/weekly-teams/:id` | Público | `service.weeklyTeam(req.params.id)` | `home-content.router.ts:30-32` |
| 6 | `GET` | `/admin/articles` | Admin (`admin` / `owner`) | `service.listArticles(true)` | `home-content.router.ts:35-37` |
| 7 | `GET` | `/admin/weekly-teams/:id/rounds` | Admin (`admin` / `owner`) | `service.listWeeklyTeams(req.params.id, true)` | `home-content.router.ts:38-40` |
| 8 | `GET` | `/admin/weekly-teams/:id/candidates/:roundId` | Admin (`admin` / `owner`) | `service.weeklyCandidates(req.params.id, req.params.roundId)` | `home-content.router.ts:41-43` |
| 9 | `GET` | `/admin/weekly-teams/:id` | Admin (`admin` / `owner`) | `service.weeklyTeam(req.params.id, true)` | `home-content.router.ts:44-46` |
| 10 | `POST` | `/admin/images/discard` | Admin + Trusted Origin | `service.discardImages(req.body)` | `home-content.router.ts:48-51` |
| 11 | `POST` | `/admin/images` | Admin + Trusted Origin | `images.save(req.body, req.get('Content-Type'))` | `home-content.router.ts:52-58` |
| 12 | `POST` | `/admin/articles` | Admin + Trusted Origin | `service.saveArticle(actor, null, req.body)` | `home-content.router.ts:59-63` |
| 13 | `PUT` | `/admin/articles/:id` | Admin + Trusted Origin | `service.saveArticle(actor, req.params.id, req.body)` | `home-content.router.ts:64-68` |
| 14 | `DELETE` | `/admin/articles/:id` | Admin + Trusted Origin | `service.deleteArticle(actor, req.params.id)` | `home-content.router.ts:69-72` |
| 15 | `PUT` | `/admin/weekly-teams/:id` | Admin + Trusted Origin | `service.saveWeeklyTeam(actor, req.params.id, req.body)` | `home-content.router.ts:73-81` |

> *Nota sobre la numeración:* La ruta `/admin/weekly-teams/:id` actualiza el quinteto de la división identificada por `:id` (UUID).

---

## 3. Especificación Detallada por Endpoint

### 3.1 `GET /api/v1/home-content/images/:name`
- **Propósito**: Entrega un archivo de imagen estático almacenado en el disco del servidor.
- **Parámetros de Ruta**:
  - `name` (`string`, requerido): Nombre del archivo con extensión. Validado estrictamente contra la expresión regular `/^[a-f0-9-]{36}\.(png|jpg|webp)$/` en `editorial-image.store.ts:11-14`.
- **Manejo de Errores**:
  - Si el nombre contiene caracteres inválidos, secuencias de escape de directorio (`../`) o extensiones no soportadas, arroja inmediatamente `notFound('Image')` -> **HTTP 404**.
  - Si el archivo físico no existe en disco (`ENOENT`), propaga `notFound('Image')` -> **HTTP 404** (`home-content.router.ts:20`).
- **Respuesta**: Flujo binario del archivo de imagen con `X-Content-Type-Options: nosniff`.

### 3.2 `GET /api/v1/home-content/articles`
- **Propósito**: Recupera el catálogo de artículos publicados para la sección editorial de la página de inicio.
- **Filtro de Consulta**: Aplica `published = true AND show_on_home = true` (`postgres-home-content.repository.ts:81`).
- **Ordenación**: `homeOrder ASC, publishedAt DESC, id ASC` (`postgres-home-content.repository.ts:83-87`).
- **Respuesta**: HTTP 200 `{ "data": EditorialArticle[] }`.

### 3.3 `GET /api/v1/home-content/articles/:id`
- **Propósito**: Recupera el contenido completo de un artículo específico para su lectura.
- **Parámetros de Ruta**:
  - `id` (`string`, requerido): UUID del artículo. Validado con `z.string().uuid()` en `home-content.service.ts:73`.
- **Comportamiento Específico**:
  - Si el artículo existe en la base de datos pero se encuentra en estado de borrador (`published === false`), el servicio arroja deliberadamente `notFound('Article')` -> **HTTP 404** (`home-content.service.ts:74`). Los borradores no son accesibles a través de la ruta pública bajo ninguna circunstancia.
- **Respuesta**: HTTP 200 `{ "data": EditorialArticle }`.

### 3.4 `GET /api/v1/home-content/weekly-teams/:id/rounds`
- **Propósito**: Lista todas las selecciones semanales de quintetos ideales publicadas para una división deportiva.
- **Parámetros de Ruta**:
  - `id` (`string`, requerido): UUID de la división (`seasons_divisions.id`). Validado con `z.string().uuid()`.
- **Filtro de Consulta**: Aplica `published = true AND roundId IS NOT NULL` (`postgres-home-content.repository.ts:203`).
- **Ordenación**: `roundId DESC, updatedAt DESC` (`postgres-home-content.repository.ts:206`).
- **Respuesta**: HTTP 200 `{ "data": WeeklyTeam[] }`.

### 3.5 `GET /api/v1/home-content/weekly-teams/:id`
- **Propósito**: Obtiene el quinteto ideal más reciente y activo de la división especificada.
- **Parámetros de Ruta**:
  - `id` (`string`, requerido): UUID de la división.
- **Comportamiento**: Invoca internamente `service.listWeeklyTeams(id)` y retorna el primer elemento del listado (`[0] ?? null`, `home-content.service.ts:132`). Si no existen quintetos publicados, devuelve `{ "data": null }`.
- **Respuesta**: HTTP 200 `{ "data": WeeklyTeam | null }`.

---

## 4. Endpoints de Administración

Todas las rutas bajo `/admin` requieren una sesión autenticada válida (`requireAuth(auth, 'admin')`, `home-content.router.ts:34`). 

### Autorización y Restricción de Roles Administrativos
- **Delimitación de Roles**: Podría presumirse la existencia de roles intermedios de redactor, cronista o `editor` que permitan publicar artículos sin privilegios de administración global.
- **Código vivo**: En `packages/database/src/schema.ts:24`, el enumerado `app_role` está compuesto exclusivamente por `'viewer'`, `'admin'` y `'owner'`. En `auth.router.ts:18`, la verificación `requireAuth(auth, 'admin')` autoriza únicamente cuando `['admin', 'owner'].includes(user.role)`. **No existe ningún rol `editor` en todo el sistema.**

### 4.1 `GET /api/v1/home-content/admin/articles`
- **Propósito**: Lista la totalidad de artículos registrados en el sistema para el panel de administración, incluyendo borradores y artículos con `showOnHome: false`.
- **Respuesta**: HTTP 200 `{ "data": EditorialArticle[] }`.

### 4.2 `GET /api/v1/home-content/admin/weekly-teams/:id/rounds`
- **Propósito**: Lista todas las selecciones de quintetos ideales de la división (incluyendo borradores donde `published === false`).
- **Respuesta**: HTTP 200 `{ "data": WeeklyTeam[] }`.

### 4.3 `GET /api/v1/home-content/admin/weekly-teams/:id/candidates/:roundId`
- **Propósito**: Recupera los jugadores elegibles para el quinteto ideal de una jornada específica.
- **Parámetros de Ruta**:
  - `id` (`string`, requerido): UUID de la división.
  - `roundId` (`string`, requerido): Número entero de jornada (1 a 32767). Coaccionado y validado mediante `z.coerce.number().int().min(1).max(32767)` (`home-content.service.ts:125`).
- **Mecanismo**: Ejecuta un `INNER JOIN` cuádruple en la base de datos verificando qué jugadores disputaron partidos oficiales en esa jornada y división, agrupando sus posiciones y campeones jugados (`postgres-home-content.repository.ts:147-193`).
- **Respuesta**: HTTP 200 `{ "data": WeeklyCandidate[] }`.

### 4.4 `GET /api/v1/home-content/admin/weekly-teams/:id`
- **Propósito**: Recupera el quinteto más reciente de la división para el panel de edición administrativa (incluyendo borradores).
- **Respuesta**: HTTP 200 `{ "data": WeeklyTeam | null }`.

### 4.5 `POST /api/v1/home-content/admin/images/discard`
- **Propósito**: Descarta y elimina físicamente del disco imágenes temporales subidas durante una sesión de edición no guardada o cancelada.
- **Seguridad**: Custodiado por `requireAuth(auth, 'admin')` (`home-content.router.ts:34`) y `requireTrustedOrigin(auth.frontendOrigin)` (`home-content.router.ts:47`).
- **Cuerpo (JSON)**:
  Objeto estrictamente validado con Zod (`home-content.service.ts:97-106`):
  ```json
  {
    "urls": [
      "/api/v1/home-content/images/01234567-89ab-cdef-0123-456789abcdef.png"
    ]
  }
  ```
  - `urls`: Array con un máximo de 100 elementos (`z.array(...).max(100)`).
  - Expresión regular por URL: Cada elemento debe validar contra `/^\/api\/v1\/home-content\/images\/[a-f0-9-]{36}\.(png|jpg|webp)$/`.
  - Esquema estricto (`.strict()`): Rechaza cualquier clave adicional.
- **Mecanismo de Descarte Concurrente Seguro**:
  Invoca `service.discardImages(req.body)` (`home-content.router.ts:49`), delegando a `repository.removeUnusedImages(urls, (url) => images.remove(url))` (`home-content.service.ts:107`).
  Adquiere un bloqueo de tabla `LOCK TABLE editorial_articles IN SHARE ROW EXCLUSIVE MODE` (`postgres-home-content.repository.ts:64`), consulta todas las portadas y cuerpos de artículos persistidos, y purga físicamente mediante `images.remove` únicamente aquellas imágenes que no se encuentren referenciadas en ningún artículo.
- **Respuesta**: HTTP 200 `{ "data": null }` (`home-content.router.ts:50`).
- **Errores**:
  - HTTP 400: JSON malformado o error sintáctico.
  - HTTP 401: Sesión no autenticada.
  - HTTP 403: Usuario sin privilegios de administrador u origen no confiable.
  - HTTP 422: Fallo de validación Zod (más de 100 URLs, formato de URL no conforme con la regex o campos desconocidos).

### 4.6 `POST /api/v1/home-content/admin/images`
- **Propósito**: Almacena un archivo de imagen en el disco del servidor para su uso en portadas o cuerpos de artículos.
- **Seguridad**: Custodiado por `requireTrustedOrigin(auth.frontendOrigin)` (`home-content.router.ts:47`).
- **Procesamiento de Carga**: Middleware `raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' })` (`home-content.router.ts:54`).
- **Validaciones**: Verifica el tipo MIME declarado y comprueba los bytes mágicos binarios en cabecera (`editorial-image.store.ts:44-57`).
- **Respuesta**: HTTP 201 `{ "data": { "url": "/api/v1/home-content/images/<uuid>.<ext>" } }`.
- **Errores**:
  - HTTP 413: Si el tamaño supera los 5 MiB (`5242880` bytes).
  - HTTP 422 `INVALID_IMAGE`: Si el tipo MIME o los bytes mágicos no coinciden con PNG, JPEG o WebP.

### 4.7 `POST /api/v1/home-content/admin/articles`
- **Propósito**: Crea un nuevo artículo editorial.
- **Cuerpo (JSON)**: Objeto `EditorialInput` validado con `articleInput` (`home-content.service.ts:15-36`). Admite campo adicional opcional `uploadedImages: string[]`.
- **Auditoría**: Registra entrada en la tabla `audit_logs` con acción `'editorial.create'` y actor Discord ID (`postgres-home-content.repository.ts:123`).
- **Respuesta**: HTTP 201 `{ "data": EditorialArticle }`.

### 4.8 `PUT /api/v1/home-content/admin/articles/:id`
- **Propósito**: Actualiza un artículo existente.
- **Parámetros de Ruta**: `id` (UUID).
- **Cuerpo (JSON)**: Objeto `EditorialInput` con `uploadedImages`.
- **Auditoría**: Registra entrada en `audit_logs` con acción `'editorial.update'` reflejando el estado previo y posterior (`postgres-home-content.repository.ts:121-127`).
- **Respuesta**: HTTP 200 `{ "data": EditorialArticle }`.

### 4.9 `DELETE /api/v1/home-content/admin/articles/:id`
- **Propósito**: Elimina definitivamente un artículo editorial y purga del disco las imágenes asociadas que no estén referenciadas en otros artículos.
- **Parámetros de Ruta**: `id` (UUID).
- **Auditoría**: Registra entrada en `audit_logs` con acción `'editorial.delete'` (`postgres-home-content.repository.ts:137-143`).
- **Respuesta**: HTTP 200 `{ "data": null }`.

### 4.10 `PUT /api/v1/home-content/admin/weekly-teams/:id`
- **Propósito**: Guarda o actualiza el quinteto ideal de una jornada para la división identificada por `:id` (UUID).
- **Cuerpo (JSON)**: Objeto `WeeklyTeamInput` con exactamente 5 jugadores y 5 roles deportivos únicos (`home-content.service.ts:37-62`).
- **Auditoría**: Registra entrada en `audit_logs` con acción `'weekly-team.update'` (`postgres-home-content.repository.ts:289-296`).
- **Respuesta**: HTTP 200 `{ "data": WeeklyTeam }`.

---

## 5. Matriz de Códigos de Estado HTTP

| Código | Causa Técnica | Estructura de Respuesta |
|:---:|---|---|
| **`200 OK`** | Operación de lectura, actualización, borrado o descarte de imágenes completada con éxito. | `{"data": ...}` |
| **`201 Created`** | Recurso creado con éxito (nuevo artículo o imagen subida). | `{"data": ...}` |
| **`400 Bad Request`** | Parámetros de consulta no conformes o incompatibilidad de formato JSON. | `{"error": "BAD_REQUEST", "message": "..."}` |
| **`401 Unauthorized`** | Petición a ruta protegida sin sesión o token caducado (`requireAuth`). | `{"error": "UNAUTHORIZED", "message": "Authentication required."}` |
| **`403 Forbidden`** | Usuario autenticado carece de rol `admin` u `owner`, o encabezado `Origin` no coincide con `frontendOrigin`. | `{"error": "FORBIDDEN", "message": "Forbidden."}` |
| **`404 Not Found`** | Artículo, división, jornada o imagen no encontrada en la base de datos o en disco (`notFound`). | `{"error": "NOT_FOUND", "message": "<Resource> not found"}` |
| **`413 Payload Too Large`** | Archivo de imagen subido excede el límite estricto de 5 MiB (`5242880` bytes). | Mensaje de error de carga Express |
| **`422 Unprocessable Entity`** | Fallo de validación Zod en cuerpo de petición (incluyendo descarte con más de 100 URLs), firma de imagen incorrecta (`INVALID_IMAGE`), jugador no elegible (`INVALID_WEEKLY_PLAYER`) o jugador duplicado (`DUPLICATE_WEEKLY_PLAYER`). | `{"error": "VALIDATION_ERROR" \| "INVALID_...", "message": "..."}` |
| **`500 Internal Server Error`** | Excepción no controlada en PostgreSQL o fallo de sistema de archivos. | `{"error": "INTERNAL_SERVER_ERROR", "message": "..."}` |
