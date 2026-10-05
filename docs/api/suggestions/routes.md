# Rutas HTTP del Buzón de Sugerencias

[⬅️ Volver a API Suggestions](README.md) | [Siguiente: Procesamiento ➡️](processing.md)

---

## 1. Visión General

El módulo de sugerencias expone sus puntos de entrada HTTP mediante la factoría `createSuggestionsRouter()` (`apps/api/src/modules/suggestions/suggestions.router.ts:46-133`).

Los endpoints permiten a los clientes enviar propuestas de forma síncrona/asíncrona y consultar el avance de su tramitación mediante sondeo periódico (*polling*), aplicando control estricto de origen contra ataques de falsificación de peticiones en sitios cruzados (CSRF) y políticas de caché sin retención.

---

## 2. Configuración y Políticas de Seguridad

### 2.1 Cabeceras de Control de Caché
Todas las rutas gestionadas por el enrutador aplican obligatoriamente el middleware (`suggestions.router.ts:49-53`):
```http
Cache-Control: no-store
```
Esto asegura que las respuestas de estado no sean cacheadas por navegadores ni redes de distribución de contenido (CDN), garantizando lecturas en tiempo real del estado de cada propuesta.

### 2.2 Validación de Origen contra CSRF
Si en la configuración del servidor se especifica `frontendOrigin` (`suggestions.router.ts:58-63`):
- Se comprueba la cabecera `Origin` de la petición HTTP.
- Si la cabecera `Origin` está ausente o no coincide estrictamente con `frontendOrigin`:
  - Se arroja un error `AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.')`.
  - La petición se rechaza con **HTTP 403 Forbidden** antes de ejecutar cualquier validación de cuerpo o resolución de usuario.

---

## 3. Catálogo de Endpoints

### 3.1 `POST /api/v1/suggestions`

Registra una nueva sugerencia en la cola de tramitación.

- **Método**: `POST`
- **Ruta física**: Declarada como `POST /` en el sub-router (`suggestions.router.ts:55`).
- **Autenticación**: Opcional / Pública.
  - El router inspecciona las cookies de la petición buscando el token de sesión en `__Host-rcl_session` (si la conexión es HTTPS) o `rcl_session` (`suggestions.router.ts:80-87`).
  - Si el token está presente y es válido, resuelve el usuario mediante `authService.currentUser(token)`.
  - Si no existe cookie o el token es inválido, continúa la ejecución tratando la propuesta como anónima.
- **Cuerpo de la Petición (JSON)**:
  ```typescript
  {
    "suggestion": string;    // Obligatorio. Texto entre 10 y 1000 caracteres.
    "isAnonymous"?: boolean; // Opcional. Booleano para forzar anonimato.
  }
  ```
- **Validación Fail-Fast**:
  - Si `typeof body.suggestion !== 'string'` o la longitud tras `trim()` es menor a 10 o mayor a 1000 caracteres, arroja `AppError(400, 'VALIDATION_ERROR', 'Suggestion must be between 10 and 1000 characters')` (`suggestions.router.ts:65-77`).
- **Respuesta Exitosa**:
  - Código: **`202 Accepted`** (`suggestions.router.ts:104`).
  - Cuerpo (`CreateSuggestionResponse`):
    ```json
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "queued"
    }
    ```
  - La respuesta 202 indica que la propuesta ha sido aceptada en memoria y encolada para su transmisión asíncrona a Discord, sin esperar a que el bot cree el hilo ni confirme la entrega.
- **Respuestas de rechazo** (cuerpo estándar `{ "error": { "code", "message" } }`; en ningún caso se crea registro ni se encola nada):

  | Código | `error.code` | Condición |
  |---|---|---|
  | `429 Too Many Requests` | `RATE_LIMITED` | El cliente superó su límite de envíos (§3.3). Incluye la cabecera `Retry-After` con los segundos hasta que se abre la ventana (`suggestions.router.ts:109-118`). |
  | `503 Service Unavailable` | `SUGGESTIONS_NOT_CONFIGURED` | `DISCORD_BOT_WS_URL` está vacío: el puente no puede entregar nada. |
  | `503 Service Unavailable` | `SUGGESTIONS_UNAVAILABLE` | El almacén de estados alcanzó `maxRecords` o la cola del puente alcanzó `maxQueueSize`. |

### 3.3 Límite de envíos

`SuggestionsService.submit()` aplica un límite de ventana fija en memoria (`SuggestionRateLimiter`, `apps/api/src/modules/suggestions/suggestion-rate-limiter.ts`) a cada envío HTTP:

| Cliente | Clave | Límite por defecto |
|---|---|---|
| Sin sesión | IP del cliente (`req.ip`) | 3 envíos cada 10 minutos |
| Con sesión | `discordId` del usuario | 10 envíos cada 10 minutos |

- Un usuario con sesión que marca `isAnonymous` sigue contando con su `discordId`; el anonimato solo afecta a la autoría publicada.
- La tabla de clientes está acotada (`maxClients`, 10 000 por defecto). Si está llena, se purgan las ventanas caducadas y, si sigue llena, el envío se rechaza con `429` en lugar de crecer.
- `req.ip` depende de `trust proxy`, que el servidor fija con la variable `TRUST_PROXY` (`apps/api/src/config/env.ts`, `apps/api/src/server.ts:102`). Por defecto vale `loopback`: se usa la cabecera `X-Forwarded-For` solo si la conexión llega de un proxy inverso en la misma máquina. Sin proxy, `false`; con proxies en otra máquina, su número de saltos o su lista de direcciones o subredes. `true` se rechaza, porque permitiría a cualquier cliente falsear su IP.
- El límite se desactiva pasando `rateLimiter: false` a `SuggestionsService` (solo se usa en pruebas).

---

### 3.2 `GET /api/v1/suggestions/status/:id`

Consulta el estado actual de una sugerencia previamente aceptada.

- **Método**: `GET`
- **Ruta física**: Declarada como `GET /status/:id` en el sub-router (`suggestions.router.ts:112`).
- **Parámetros de Ruta**:
  - `id`: Identificador UUID de la sugerencia devuelto en la respuesta 202.
- **Flujo de Ejecución**:
  - Invoca `service.getStatus(id)` (`suggestions.router.ts:118`).
  - Si el registro no existe en memoria o ha sido purgado por expiración de su TTL de 2 horas, arroja `notFound('Suggestion')` resolviendo en **HTTP 404 Not Found** con cuerpo:
    ```json
    {
      "code": "NOT_FOUND",
      "message": "Suggestion not found"
    }
    ```
  - Si el registro existe, emite **HTTP 200 OK** (`suggestions.router.ts:125`) con el DTO `SuggestionStatusResponse`:
    ```json
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "processing"
    }
    ```
- **Variaciones de Estado en la Respuesta (200 OK)**:
  - En estado `retrying`:
    ```json
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "retrying",
      "nextRetryInSeconds": 15
    }
    ```
  - En estado `failed`:
    ```json
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "failed",
      "incidentId": "c9a646d3-9c61-4cd7-bf5b-c2e7b5cb4e77"
    }
    ```
    La respuesta no incluye el texto del error: hosts, puertos, códigos de socket o motivos devueltos por el bot solo se escriben en el log del servidor, en la línea `[INCIDENT <incidentId>]` correspondiente (`suggestions.service.ts:234-251`).
  - En estado `confirmed`:
    ```json
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "confirmed"
    }
    ```
