# Gateway WebSocket y Protocolo de Rutas ROFL

[⬅️ Volver a API ROFL Upload](README.md) | [Siguiente: Procesamiento ➡️](processing.md)

---

## 1. Visión General

La ingesta de archivos de repetición se expone a través de un gateway de WebSocket dedicado montado en la ruta `/ws/rofl-upload`. Este canal proporciona comunicación bidireccional en tiempo real, permitiendo transmitir archivos binarios segmentados en bloques (*chunks*) desde el navegador, aplicar contrapresión de flujo y notificar de vuelta al cliente el avance granular del procesamiento, la posición en la cola de descompresión y el resumen final de la transacción.

El gateway está implementado en `apps/api/src/modules/rofl-upload/websocket/rofl-upload.gateway.ts` mediante la función `attachRoflUploadGateway()`.

---

## 2. Control de Acceso: Handshake, Sesión y Rol

El acceso se comprueba en dos fases: primero sobre el handshake HTTP de *upgrade*, antes de aceptar la conexión, y después sobre la sesión, ya con el socket abierto.

### 2.1 Opciones de Seguridad de `attachRoflUploadGateway()`

| Opción | Tipo | Uso en `server.ts` | Efecto |
|---|---|---|---|
| `authService` | `AuthService \| undefined` | Se pasa solo si están configuradas las credenciales de Discord (`server.ts:49-58`). | Valida la cookie de sesión y el rol. Sin ella el gateway rechaza todos los handshakes (§2.2). |
| `frontendOrigin` | `string \| undefined` | `env.CORS_ORIGIN` (`server.ts:108-112`). | Único valor admitido de la cabecera `Origin`. Sin ella el gateway rechaza todos los handshakes. |
| `secureCookies` | `boolean \| undefined` (por defecto `false`) | El mismo valor que `AuthOptions.secureCookies`: `true` si `DISCORD_REDIRECT_URI` usa `https:`; `false` sin credenciales de Discord (`server.ts:59-61, 108-112`). | Elige el nombre de la cookie de sesión que se lee (§2.3). |
| `allowUnauthenticated` | `boolean \| undefined` | **No se usa.** | Exclusiva de los tests: permite conexiones sin sesión cuando no hay `authService`. |
| `logIncident` | `(incidentId, context, error) => void` | No se pasa (usa `console.error`). | Registra el detalle de los errores inesperados (§7). |

### 2.2 Validación del Handshake (`verifyClient`)

La opción `verifyClient` del `WebSocketServer` (`rofl-upload.gateway.ts:65-79`) se ejecuta antes de aceptar el *upgrade*; un handshake rechazado nunca llega al evento `connection` ni a `authorize()`. Las comprobaciones, en este orden:

1. **Autenticación no configurada → HTTP `503`** (`Authentication is not configured`): si no hay `authService` y `allowUnauthenticated` no es `true`. Equivale a las rutas HTTP de administración, que responden `503` en la misma situación (`app.ts`). Una API arrancada sin credenciales de Discord no acepta subidas.
2. **Origen no admitido → HTTP `403`** (`Request origin is not allowed`): si `frontendOrigin` no está definido o la cabecera `Origin` no es exactamente igual a él. Es el mismo criterio de igualdad estricta que `requireTrustedOrigin` aplica a las mutaciones HTTP con cookie (`auth.router.ts:26-33`). Un handshake sin cabecera `Origin` (por ejemplo, un cliente que no es un navegador) también se rechaza.

El cliente recibe la respuesta HTTP de rechazo, no un código de cierre de WebSocket; en el navegador se observa como un cierre `1006` y el hook web lo muestra como conexión perdida. La web no necesita cambios: abre el socket en el mismo origen desde el que se sirve (`useRoflUploadWs.ts:121-123`), y en desarrollo el proxy de Vite (`apps/web/vite.config.ts`) conserva la cabecera `Origin` del navegador, que coincide con el valor por defecto de `CORS_ORIGIN` (`http://localhost:5173`).

### 2.3 Extracción de Cookie de Sesión
Al abrir la conexión, el gateway lee el token con `readSessionCookie(req.headers.cookie, secureCookies)` (`rofl-upload.gateway.ts:95`), el mismo lector que usa la API HTTP (`apps/api/src/modules/auth/session-cookie.ts`, descrito en [Rutas de autenticación §3.1](../auth/routes.md)):
- Con `secureCookies: true` solo se lee `__Host-rcl_session`; con `false` (o sin la opción) solo `rcl_session`. El otro nombre se ignora aunque llegue en la cabecera.
- Si la cookie aparece más de una vez se considera ausente, como en HTTP.
- Si la cabecera está ausente, no contiene la cookie esperada, la contiene duplicada o con valor vacío, `authorize()` cierra la conexión con `4001` y el motivo `Unauthorized: Missing session cookie`.

Un navegador solo tiene la cookie que el router de autenticación le fijó para el esquema en uso (`__Host-rcl_session` en HTTPS, `rcl_session` en HTTP), así que este criterio no cambia nada para la web.

### 2.4 Validación de Rol Administrativo
`authorize()` (`rofl-upload.gateway.ts:96-116`) se ejecuta al abrir la conexión y se repite antes de procesar (`finish`) y antes de persistir:
- Se consulta el usuario activo correspondiente al token de sesión (`authService.currentUser(sessionToken)`).
- **Código de cierre `4001` (No Autorizado):** si el token no existe o ha expirado (`rofl-upload.gateway.ts:103, 108`). También si no hay `authService` (`rofl-upload.gateway.ts:99`); en la práctica este caso ya lo rechaza el handshake con `503`, salvo con `allowUnauthenticated`, en cuyo caso `authorize()` devuelve `true` sin consultar sesión.
- **Código de cierre `4003` (Prohibido):** si el usuario carece de rol administrativo (`user.role !== 'admin' && user.role !== 'owner'`) (`rofl-upload.gateway.ts:112`).

---

## 3. Ciclo de Vida de la Conexión y Máquina de Estados

La conexión del WebSocket transiciona secuencialmente por cuatro estados internos en el servidor (`rofl-upload.gateway.ts:118`):

```
       [Conexión establecida]
                 │
                 ▼
              'idle' ◄──────────────────┐
                 │                      │
       (Recibe { type: 'start' })       │
                 │                      │
                 ▼                      │
            'uploading'                 │ (Error o Cierre)
                 │                      │
       (Recibe { type: 'finish' })      │
                 │                      │
                 ▼                      │
            'processing'                │
                 │                      │
                 ├──────────────────────┘
                 ▼
              'closed'
```

---

## 4. Protocolo de Mensajería

El protocolo opera mediante dos tipos de tramas de WebSocket:

### 4.1 Mensajes de Control del Cliente (JSON)
Definidos en `packages/contracts/src/rofl-upload.ts:76-85`:

| Tipo | Formato de Carga Útil | Descripción y Momento de Envío |
|---|---|---|
| `start` | `{"type": "start", "filename": "serie_final.zip"}` | Inicializa la sesión de subida en el servidor. Crea el directorio temporal en `os.tmpdir()` y abre el `WriteStream` a disco (`rofl-upload.gateway.ts:210-249`). |
| `finish` | `{"type": "finish"}` | Notifica que se transmitieron todos los bytes binarios. Cierra el `WriteStream` en disco y transiciona al pipeline de procesamiento (`rofl-upload.gateway.ts:251-272`). |

> [!NOTE]
> **Comportamiento Específico:** Si el cliente envía un mensaje `{ "type": "start" }` cuando la sesión ya no está en estado `'idle'` (`state !== 'idle'`), el gateway responde con `{ type: 'error', message: 'Upload already in progress' }` (`rofl-upload.gateway.ts:211-213`) **sin reiniciar el acumulador `receivedBytes` ni recrear los streams**, anulando cualquier intento de saltarse el control de cuotas mediante mensajes intercalados.

### 4.2 Tramas Binarias de Datos (Chunks)
Cuando el servidor recibe tramas marcadas como binarias (`isBinary === true`, `rofl-upload.gateway.ts:163-198`):
- Verifica que el estado sea estrictamente `'uploading'` y que `fileWriteStream` esté activo. Si no, emite error: `Binary data chunk received before upload was started`.
- Concatena el búfer y actualiza `receivedBytes += buffer.length`.
- Escribe el chunk directamente en el stream de disco (`fileWriteStream.write(buffer)`).

---

## 5. Cuota de Subida y Código de Cierre 1009

Para proteger el sistema contra la saturación de espacio en disco en particiones temporales:
- **Límite máximo por archivo/paquete:** `MAX_UPLOAD_BYTES = 50 * 1024 * 1024` (50 MB exactos, `rofl-upload.gateway.ts:124`).
- **Comprobación en tiempo real:** Se evalúa en cada trama binaria (`rofl-upload.gateway.ts:179-188`).
- **Comportamiento ante exceso:**
  1. Envía mensaje JSON de error: `{"type": "error", "message": "File exceeds maximum upload size (50MB)"}`.
  2. Purga y destruye los recursos en disco (`await cleanupResources()`).
  3. Cierra la conexión WebSocket con código estándar RFC 6455 **`1009` (*Message Too Big*)** y razón `'Message too big'`.

---

## 6. Eventos Emitidos por el Servidor

Definidos en `packages/contracts/src/rofl-upload.ts:21-74`:

| Evento (`type`) | Carga Útil | Significado / Contexto |
|---|---|---|
| `started` | `{ type: 'started', filename: string }` | Confirma la apertura del archivo en el servidor y el inicio de la fase de recepción binaria. |
| `queue` | `{ type: 'queue', position: number, total: number }` | Notifica la posición en la cola FIFO de descompresión de archivos ZIP concurrentes. |
| `stage` | `{ type: 'stage', stage: 'decompressing' \| 'parsing' \| 'validating' \| 'persisting' \| 'completed' }` | Transición entre las etapas del pipeline de procesamiento. |
| `progress` | `{ type: 'progress', percent: number, message: string }` | Porcentaje de avance de la etapa actual con mensaje descriptivo de terminal. |
| `warning` | `{ type: 'warning', message: string }` | Advertencia no fatal (ej. archivo con cabecera no-ROFL omitido dentro de un ZIP). |
| `anomaly` | `{ type: 'anomaly', anomaly: MultiAccountAnomaly }` | Alerta de un usuario de Discord jugando con múltiples cuentas en la misma partida. |
| `success` | `{ type: 'success', summary: BatchUploadSummary }` | Ingesta completada exitosamente; incluye partidas procesadas, jugadores y anomalías. |
| `error` | `{ type: 'error', message: string, incidentId?: string }` | Error fatal que aborta la subida; si ya se estaba persistiendo, la transacción se revierte. `incidentId` solo aparece en los errores inesperados (§7). |

---

## 7. Errores de Dominio frente a Errores Inesperados

El gateway separa dos clases de error al enviar el evento `error`:

- **Errores de dominio (`RoflUploadDomainError`, `apps/api/src/modules/rofl-upload/types/rofl-upload.errors.ts`):** rechazos causados por el contenido de la subida, útiles para el administrador. Su mensaje se envía tal cual. Son: tipo de fichero no admitido; límites del ZIP (número de ficheros, tamaño individual, ratio de compresión, tamaño total) y *Zip Slip*; ZIP sin `.rofl`; lote sin ninguna cabecera ROFL válida; invocadores no registrados (`Validation failed: …`); jugadores fuera de plantilla (`Roster violation: …`, `rofl-upload.gateway.ts:378`); y las reglas del repositorio sobre cuenta principal, membresía, unanimidad de equipos y partido inexistente o cerrado (`postgres-rofl-upload.repository.ts`). Los mensajes que el gateway emite directamente (JSON inválido, secuencia de mensajes incorrecta, cuota de 50 MB) también se envían tal cual.
- **Errores inesperados:** cualquier otro, por ejemplo fallos de escritura en disco, de creación del directorio temporal, de vaciado del stream, del subproceso del parser (incluido el *timeout*), de lectura de un ZIP corrupto o de PostgreSQL. `sendIncident()` (`rofl-upload.gateway.ts:134-143`) genera un `incidentId` (UUID v4), registra el detalle con `logIncident` y envía:

```json
{
  "type": "error",
  "message": "Unexpected server error while processing the upload. Contact an administrator with the incident ID (<incidentId>).",
  "incidentId": "<incidentId>"
}
```

El identificador va también dentro de `message` porque la web solo muestra ese campo. El registro por defecto escribe en `stderr` una línea `[INCIDENT <incidentId>] Type: ROFL_UPLOAD_<contexto> | Message: <stack>`, con los contextos `DISK_WRITE`, `INIT_UPLOAD_DIR`, `FLUSH_FILE` y `PROCESSING`.

> [!NOTE]
> **Comportamiento Específico:** Si el cliente se desconecta durante el procesamiento, el `AbortController` de la conexión aborta la cola de descompresión; ese error no se registra como incidente ni se envía, porque el socket ya está cerrado (`rofl-upload.gateway.ts:418`).
