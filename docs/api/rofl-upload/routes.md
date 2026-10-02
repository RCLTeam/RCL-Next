# Gateway WebSocket y Protocolo de Rutas ROFL

[⬅️ Volver a API ROFL Upload](README.md) | [Siguiente: Procesamiento ➡️](processing.md)

---

## 1. Visión General

La ingesta de archivos de repetición se expone a través de un gateway de WebSocket dedicado montado en la ruta `/ws/rofl-upload`. Este canal proporciona comunicación bidireccional en tiempo real, permitiendo transmitir archivos binarios segmentados en bloques (*chunks*) desde el navegador, aplicar contrapresión de flujo y notificar de vuelta al cliente el avance granular del procesamiento, la posición en la cola de descompresión y el resumen final de la transacción.

El gateway está implementado en `apps/api/src/modules/rofl-upload/websocket/rofl-upload.gateway.ts` mediante la función `attachRoflUploadGateway()`.

---

## 2. Autenticación y Autorización por Sesión

Antes de aceptar comandos o transmisiones de datos, el gateway valida la identidad y los privilegios del cliente en el evento `connection` (`rofl-upload.gateway.ts:63-82`):

### 2.1 Extracción de Cookie de Sesión
La función auxiliar `extractSessionToken()` (`rofl-upload.gateway.ts:27-41`) analiza la cabecera `Cookie` de la petición HTTP entrante:
- Busca la clave estándar `rcl_session` o su variante reforzada de aislamiento de origen con prefijo de host `__Host-rcl_session`.
- Si la cabecera está ausente o no contiene el token, rechaza la conexión inmediatamente.

### 2.2 Validación de Rol Administrativo
Si se proporciona una instancia de `authService` en las opciones de configuración:
- Se consulta el usuario activo correspondiente al token de sesión (`authService.currentUser(sessionToken)`).
- **Código de cierre `4001` (No Autorizado):** Si el token de sesión no existe o ha expirado (`rofl-upload.gateway.ts:68, 73`).
- **Código de cierre `4003` (Prohibido):** Si el usuario autenticado carece de rol administrativo (`user.role !== 'admin' && user.role !== 'owner'`) (`rofl-upload.gateway.ts:77`).

---

## 3. Ciclo de Vida de la Conexión y Máquina de Estados

La conexión del WebSocket transiciona secuencialmente por cuatro estados internos en el servidor (`rofl-upload.gateway.ts:83`):

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
Definidos en `packages/contracts/src/rofl-upload.ts:74-84`:

| Tipo | Formato de Carga Útil | Descripción y Momento de Envío |
|---|---|---|
| `start` | `{"type": "start", "filename": "serie_final.zip"}` | Inicializa la sesión de subida en el servidor. Crea el directorio temporal en `os.tmpdir()` y abre el `WriteStream` a disco (`rofl-upload.gateway.ts:162-187`). |
| `finish` | `{"type": "finish"}` | Notifica que se transmitieron todos los bytes binarios. Cierra el `WriteStream` en disco y transiciona al pipeline de procesamiento (`rofl-upload.gateway.ts:189-218`). |

> [!NOTE]
> **Comportamiento Específico:** Si el cliente envía un mensaje `{ "type": "start" }` cuando la sesión ya no está en estado `'idle'` (`state !== 'idle'`), el gateway responde con `{ type: 'error', message: 'Upload already in progress' }` (`rofl-upload.gateway.ts:164-166`) **sin reiniciar el acumulador `receivedBytes` ni recrear los streams**, anulando cualquier intento de saltarse el control de cuotas mediante mensajes intercalados.

### 4.2 Tramas Binarias de Datos (Chunks)
Cuando el servidor recibe tramas marcadas como binarias (`isBinary === true`, `rofl-upload.gateway.ts:117-152`):
- Verifica que el estado sea estrictamente `'uploading'` y que `fileWriteStream` esté activo. Si no, emite error: `Binary data chunk received before upload was started`.
- Concatena el búfer y actualiza `receivedBytes += buffer.length`.
- Escribe el chunk directamente en el stream de disco (`fileWriteStream.write(buffer)`).

---

## 5. Cuota de Subida y Código de Cierre 1009

Para proteger el sistema contra la saturación de espacio en disco en particiones temporales:
- **Límite máximo por archivo/paquete:** `MAX_UPLOAD_BYTES = 50 * 1024 * 1024` (50 MB exactos, `rofl-upload.gateway.ts:89`).
- **Comprobación en tiempo real:** Se evalúa en cada trama binaria (`rofl-upload.gateway.ts:133-142`).
- **Comportamiento ante exceso:**
  1. Envía mensaje JSON de error: `{"type": "error", "message": "File exceeds maximum upload size (50MB)"}`.
  2. Purga y destruye los recursos en disco (`await cleanupResources()`).
  3. Cierra la conexión WebSocket con código estándar RFC 6455 **`1009` (*Message Too Big*)** y razón `'Message too big'`.

---

## 6. Eventos Emitidos por el Servidor

Definidos en `packages/contracts/src/rofl-upload.ts:21-72`:

| Evento (`type`) | Carga Útil | Significado / Contexto |
|---|---|---|
| `started` | `{ type: 'started', filename: string }` | Confirma la apertura del archivo en el servidor y el inicio de la fase de recepción binaria. |
| `queue` | `{ type: 'queue', position: number, total: number }` | Notifica la posición en la cola FIFO de descompresión de archivos ZIP concurrentes. |
| `stage` | `{ type: 'stage', stage: 'decompressing' \| 'parsing' \| 'validating' \| 'persisting' \| 'completed' }` | Transición entre las etapas del pipeline de procesamiento. |
| `progress` | `{ type: 'progress', percent: number, message: string }` | Porcentaje de avance de la etapa actual con mensaje descriptivo de terminal. |
| `warning` | `{ type: 'warning', message: string }` | Advertencia no fatal (ej. archivo con cabecera no-ROFL omitido dentro de un ZIP). |
| `anomaly` | `{ type: 'anomaly', anomaly: MultiAccountAnomaly }` | Alerta de un usuario de Discord jugando con múltiples cuentas en la misma partida. |
| `success` | `{ type: 'success', summary: BatchUploadSummary }` | Ingesta completada exitosamente; incluye partidas procesadas, jugadores y anomalías. |
| `error` | `{ type: 'error', message: string }` | Error fatal que aborta la transacción y revierte cambios en base de datos. |
