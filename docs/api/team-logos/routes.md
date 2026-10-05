# Rutas HTTP: Team Logos

[⬅️ Volver a Team Logos](README.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General y Montaje del Enrutador

El enrutador de gestión de logos de equipos se construye mediante la función factoría `teamLogosRouter(auth?: AuthOptions, store = new TeamLogosStore()): Router` en `apps/api/src/modules/team-logos/team-logos.router.ts:5-42`. El módulo se registra en el pipeline central de Express (`apps/api/src/app.ts:74-77`) bajo el prefijo canónico `/api/v1/team-logos`:

```typescript
// apps/api/src/app.ts:74-77
app.use(
  '/api/v1/team-logos',
  teamLogosRouter(options.auth, new TeamLogosStore(options.teamLogoDirectory))
);
```

### Políticas de Middleware y Seguridad Perimetral

1. **Aislamiento de Caché Administrativa (`Cache-Control: no-store`):**
   El middleware registrado en `team-logos.router.ts:7-10` intercepta todas las peticiones con prefijo `/admin`, inyectando la cabecera `Cache-Control: no-store`. Esto garantiza que los navegadores y servidores proxy intermediarios nunca almacenen en caché el inventario de logos ni las respuestas de mutación.

2. **Salvaguarda de Autenticación No Configurada (HTTP 503):**
   Si la aplicación se inicializa sin credenciales ni servicios de autenticación (`!auth`, `team-logos.router.ts:19-24`), cualquier petición que intente acceder a rutas administrativas es interceptada de inmediato, devolviendo un estado HTTP 503 Service Unavailable con el cuerpo `{ error: { message: 'La autenticación no está configurada.' } }`.

3. **Control de Acceso Basado en Roles (`requireAuth`):**
   Las rutas `/admin` aplican el middleware `requireAuth(auth, 'admin')` (`team-logos.router.ts:25`). Este middleware (`apps/api/src/modules/auth/auth.router.ts:13-23`) recupera la cookie de sesión (`rcl_session` o `__Host-rcl_session`), verifica el token opaco contra la base de datos y valida que el usuario posea rol `admin` u `owner`. Si no hay sesión, responde con HTTP 401; si el usuario tiene rol `viewer`, aborta con `AppError(403, 'FORBIDDEN', 'Insufficient permissions.')`.

4. **Validación de Origen Seguro (`requireTrustedOrigin`):**
   Antes de permitir mutaciones de estado (`POST`, `DELETE`), el enrutador ejecuta `requireTrustedOrigin(auth.frontendOrigin)` (`team-logos.router.ts:27`). Este middleware (`auth.router.ts:26-33`) compara la cabecera HTTP `Origin` de la petición contra el origen autorizado del frontend (`auth.frontendOrigin`). Si el origen no coincide exactamente o está ausente, rechaza la operación con `AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.')`, mitigando ataques de falsificación de peticiones entre sitios (CSRF).

5. **Recepción de Carga Binaria Sin Procesamiento Multipart:**
   El endpoint de subida (`POST /admin/:name`) utiliza el analizador nativo `express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' })` (`team-logos.router.ts:30`). En lugar de utilizar parsers complejos de `multipart/form-data`, el cliente envía los bytes del archivo directamente en el cuerpo HTTP con su respectivo `Content-Type`, reduciendo la superficie de ataque y el uso de memoria en el servidor.

---

## 2. Catálogo Canónico de Endpoints

| Método | Ruta Relativa | Nivel de Acceso | Controlador / Acción | Cabeceras Destacadas | Ubicación en Router |
|:---:|---|---|---|---|:---:|
| `GET` | `/images/:name` | Público | `store.file(name)` & `res.sendFile()` | `Cache-Control: public, max-age=3600, must-revalidate`<br>`X-Content-Type-Options: nosniff`<br>`ETag` | `team-logos.router.ts:11-18` |
| `GET` | `/admin` | Admin / Owner | `store.list()` | `Cache-Control: no-store` | `team-logos.router.ts:26` |
| `POST` | `/admin/:name` | Admin / Owner + Trusted Origin | `store.save(name, body, type)` | `Cache-Control: no-store`<br>`Content-Type: image/png \| image/jpeg \| image/webp` | `team-logos.router.ts:28-36` |
| `DELETE` | `/admin/:name` | Admin / Owner + Trusted Origin | `store.remove(name)` | `Cache-Control: no-store` | `team-logos.router.ts:37-40` |

---

## 3. Especificación Detallada por Endpoint

### 3.1 `GET /api/v1/team-logos/images/:name`
- **Propósito:** Entrega el archivo binario de la imagen solicitada para su renderizado público en clientes web, tablas de clasificación y fichas de equipo.
- **Autorización:** Abierta (sin autenticación).
- **Parámetros de Ruta:**
  - `:name` (string, obligatorio): Nombre del archivo con su extensión (`ej. AKL.webp`, `KOI.png`). Debe coincidir con la expresión regular `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.(png|jpe?g|webp)$/`.
- **Cabeceras Inyectadas:**
  - `Cache-Control: public, max-age=3600, must-revalidate` (`team-logos.router.ts:13`): Permite que navegadores y proxies intermedios almacenen en caché la imagen durante 1 hora (3.600 segundos), obligando a revalidar con el servidor antes de entregar copias obsoletas una vez expirado el tiempo.
  - `X-Content-Type-Options: nosniff` (`team-logos.router.ts:14`): Impide que navegadores infieran tipos ejecutables (como HTML o scripts) a partir del contenido binario.
  - `ETag` (generada automáticamente por `res.sendFile`): Firma única basada en tamaño y fecha de modificación del archivo en disco.
- **Respuestas:**
  - **`200 OK`:** Retorna el flujo binario de la imagen con su cabecera `Content-Type` correspondiente deducida por Express (`image/png`, `image/jpeg` o `image/webp`).
  - **`304 Not Modified`:** Si el cliente incluye `If-None-Match: <etag>` y el archivo en disco no ha variado, Express aborta el envío del cuerpo binario y responde con 304, ahorrando ancho de banda.
  - **`404 Not Found`:** Emitido si el archivo no existe en el directorio de almacenamiento (`ENOENT`), si es un directorio, o si constituye un enlace simbólico (`team-logos.store.ts:24-28`):
    ```json
    {
      "error": {
        "code": "NOT_FOUND",
        "message": "Logo was not found."
      }
    }
    ```
  - **`422 Unprocessable Entity`:** Emitido si el parámetro `:name` no cumple con la expresión regular de validación (`team-logos.store.ts:13-18`):
    ```json
    {
      "error": {
        "code": "INVALID_LOGO_NAME",
        "message": "Usa un nombre con letras, números, guiones y extensión PNG, JPEG o WebP."
      }
    }
    ```

---

### 3.2 `GET /api/v1/team-logos/admin`
- **Propósito:** Recupera el inventario completo de logos disponibles en el sistema de archivos para poblar el panel de administración.
- **Autorización:** Sesión activa con rol `admin` u `owner`.
- **Cabeceras de Respuesta:** `Cache-Control: no-store`.
- **Comportamiento:**
  - Asegura la existencia del directorio mediante `mkdir(directory, { recursive: true })` (`team-logos.store.ts:33`).
  - Lee todas las entradas con `readdir(directory, { withFileTypes: true })` (`team-logos.store.ts:34`).
  - Filtra exclusivamente las entradas que sean archivos regulares (`entry.isFile()`) y cuyo nombre cumpla la expresión regular de nomenclatura (`team-logos.store.ts:37-39`).
  - Mapea cada archivo al formato `{ name, url: '/api/v1/team-logos/images/' + name }` y los ordena alfabéticamente (`team-logos.store.ts:40-41`).
- **Respuestas:**
  - **`200 OK`:**
    ```json
    {
      "data": [
        {
          "name": "AKL.webp",
          "url": "/api/v1/team-logos/images/AKL.webp"
        },
        {
          "name": "placeholder.webp",
          "url": "/api/v1/team-logos/images/placeholder.webp"
        }
      ]
    }
    ```
  - **`401 Unauthorized`:** Sesión no autenticada o token inválido.
  - **`403 Forbidden`:** Usuario autenticado con rol `viewer` (`FORBIDDEN`).
  - **`503 Service Unavailable`:** Autenticación no configurada en la API.

---

### 3.3 `POST /api/v1/team-logos/admin/:name`
- **Propósito:** Almacena una nueva insignia en disco de manera atómica, validando formato, tamaño y firma de bytes mágicos.
- **Autorización:** Sesión activa con rol `admin` u `owner` y cabecera `Origin` correspondiente a `frontendOrigin`.
- **Parámetros de Ruta:**
  - `:name` (string, obligatorio): Nombre deseado del archivo (`ej. equipo-nuevo.png`).
- **Cabeceras Obligatorias de Petición:**
  - `Content-Type`: Debe ser exactamente `image/png`, `image/jpeg` o `image/webp`.
  - `Origin`: Debe coincidir con la URL base del frontend autorizada en la configuración del servidor.
- **Cuerpo de Petición:** Flujo binario crudo del archivo de imagen (hasta 5 MiB / 5.242.880 bytes).
- **Flujo de Ejecución y Validaciones:**
  1. `assertMutable(name)` (`team-logos.store.ts:45, 82-89`): Si el nombre (en minúsculas) es `placeholder.webp`, rechaza la petición con HTTP 403 `PROTECTED_LOGO`.
  2. `path(name)` (`team-logos.store.ts:46, 12-20`): Si no cumple la expresión regular, lanza HTTP 422 `INVALID_LOGO_NAME`.
  3. Tamaño y tipo de búfer (`team-logos.store.ts:47-48`): Si el cuerpo no es un `Buffer`, está vacío o excede los 5 MiB, lanza HTTP 422 `INVALID_IMAGE`. Si la petición excede el límite del parser de Express, el middleware `errorHandler` (`apps/api/src/shared/http.ts:24-32`) emite HTTP 413 `PAYLOAD_TOO_LARGE`.
  4. Análisis binario de *magic bytes* (`team-logos.store.ts:49-65`): Comprueba que la extensión, el `Content-Type` y los primeros bytes del búfer coincidan estrictamente con la firma del formato.
  5. Escritura atómica (`team-logos.store.ts:67-73`): Ejecuta `writeFile(path, body, { flag: 'wx' })`. Si el archivo ya existe, captura el error `EEXIST` y lanza HTTP 409 `LOGO_EXISTS`.
- **Respuestas:**
  - **`201 Created`:**
    ```json
    {
      "data": {
        "name": "equipo-nuevo.png",
        "url": "/api/v1/team-logos/images/equipo-nuevo.png"
      }
    }
    ```
  - **`400 Bad Request`:** Cuerpo de petición malformado o no parseable por el middleware raw.
  - **`401 Unauthorized`:** Sesión no iniciada.
  - **`403 Forbidden`:**
    - Rol insuficiente (`FORBIDDEN`).
    - Origen no autorizado (`INVALID_ORIGIN`).
    - Intento de mutar el logo de reserva (`PROTECTED_LOGO`):
      ```json
      {
        "error": {
          "code": "PROTECTED_LOGO",
          "message": "El logo de reserva está protegido y no se puede modificar ni eliminar."
        }
      }
      ```
  - **`409 Conflict`:** Ya existe un archivo con dicho nombre en disco (`team-logos.store.ts:70-72`):
    ```json
    {
      "error": {
        "code": "LOGO_EXISTS",
        "message": "Ya existe un logo con ese nombre."
      }
    }
    ```
  - **`413 Payload Too Large`:** La imagen excede el límite de 5 MB configurado en el middleware:
    ```json
    {
      "error": {
        "code": "PAYLOAD_TOO_LARGE",
        "message": "Invalid request body."
      }
    }
    ```
  - **`422 Unprocessable Entity`:**
    - Nombre no válido (`INVALID_LOGO_NAME`).
    - Contenido, extensión o firma de bytes mágicos no coincidentes (`INVALID_IMAGE`):
      ```json
      {
        "error": {
          "code": "INVALID_IMAGE",
          "message": "El contenido y la extensión deben corresponder a una imagen PNG, JPEG o WebP."
        }
      }
      ```
  - **`503 Service Unavailable`:** Autenticación no configurada.

---

### 3.4 `DELETE /api/v1/team-logos/admin/:name`
- **Propósito:** Elimina de forma permanente un archivo de logo del almacenamiento en disco.
- **Autorización:** Sesión activa con rol `admin` u `owner` y cabecera `Origin` correspondiente a `frontendOrigin`.
- **Parámetros de Ruta:**
  - `:name` (string, obligatorio): Nombre del archivo a eliminar.
- **Flujo de Ejecución:**
  1. `assertMutable(name)` (`team-logos.store.ts:78, 82-89`): Comprueba que no se intente eliminar `placeholder.webp`. Si coincide, emite HTTP 403 `PROTECTED_LOGO`.
  2. `file(name)` (`team-logos.store.ts:79, 22-30`): Valida el nombre y comprueba mediante `lstat` que el archivo exista en disco y no sea un enlace simbólico ni directorio. Si no existe, emite HTTP 404 `NOT_FOUND`.
  3. `unlink(path)` (`team-logos.store.ts:79`): Desvincula y elimina el archivo físico.
- **Respuestas:**
  - **`200 OK`:**
    ```json
    {
      "data": null
    }
    ```
  - **`401 Unauthorized`:** Sesión no iniciada.
  - **`403 Forbidden`:** Rol no autorizado (`FORBIDDEN`), origen no confiable (`INVALID_ORIGIN`), o intento de eliminar `placeholder.webp` (`PROTECTED_LOGO`).
  - **`404 Not Found`:** El logo no existe en disco (`NOT_FOUND`).
  - **`422 Unprocessable Entity`:** Nombre de archivo sintácticamente no válido (`INVALID_LOGO_NAME`).
  - **`503 Service Unavailable`:** Autenticación no configurada.
