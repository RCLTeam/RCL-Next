# Ciclo de Vida del WebSocket y Pipeline de Procesamiento del Puente

[⬅️ Volver a API Discord Bridge](README.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General

El motor de comunicación del puente Discord (`DiscordBridgeClient`, implementado en `apps/api/src/modules/discord-bridge/discord-bridge.client.ts:62-655`) gestiona la conexión con el bot mediante una arquitectura asíncrona no bloqueante basada en `EventEmitter`.

El diseño elimina conexiones ociosas innecesarias mediante apertura bajo demanda (*lazy*), aplica desconexión limpia tras periodos prolongados de inactividad, desacopla la transmisión en un protocolo de dos fases y garantiza que ráfagas de limitación de tasa (*rate limit*) en Discord no bloqueen el servidor indefinidamente.

---

## 2. Ciclo de Vida del Socket y Conexión Bajo Demanda (*Lazy*)

El cliente no se conecta de forma anticipada en el arranque del servidor (`bootstrap`). La conexión se establece de forma reactiva a través del método privado `ensureConnected()` (`discord-bridge.client.ts:308-326`).

```
                [Llamada a send()]
                        │
                        ▼
             ¿Socket abierto y autenticado?
             ├── SÍ ──► Reutilizar socket existente
             └── NO
                  │
                  ▼
             ¿Conexión en curso (connectPromise)?
             ├── SÍ ──► Esperar promesa existente (evita carreras)
             └── NO
                  │
                  ▼
             Instanciar WebSocket (wsFactory)
                  │
                  ▼
             Arrancar timeout de conexión (10 s)
                  │
                  ▼
             Evento 'open': enviar frame LOGIN con supertoken
                  │
                  ▼
             Evento 'message': recibir LOGIN_SUCCESS
                  │
                  ├── ÉXITO ──► isAuthenticated = true, resolver promesa, despachar cola
                  └── FALLO ──► Limpiar socket, rechazar promesa y todos los elementos en cola
```

### 2.0 Fallos de conexión
`send()` y `processQueue()` no llaman a `ensureConnected()` directamente, sino a `connectOrFailQueue()` (`discord-bridge.client.ts:403-418`), que captura el rechazo de la conexión y rechaza todos los elementos de la cola con `BridgeUnavailableError`. Así:
- Ningún fallo de conexión (URL no válida, conexión rechazada, cierre antes de `LOGIN_SUCCESS`, tiempo de espera agotado) deja una promesa rechazada sin manejar ni elementos pendientes para siempre.
- `BridgeUnavailableError` tiene un mensaje genérico; el error original va en `cause` y solo se escribe en el log del servidor.
- El siguiente `send()` vuelve a intentar la conexión, así que cuando el bot vuelve a estar disponible los envíos nuevos se entregan sin reiniciar la API.
- Al descartar un socket (`cleanupSocket()`, `discord-bridge.client.ts:743-760`) se deja un listener de `error` vacío y se termina el socket si aún está conectando, para que un fallo tardío de ese socket no se convierta en una excepción no capturada.

Antes de encolar, `send()` rechaza de inmediato con `BridgeNotConfiguredError` si `wsUrl` está vacío (`isConfigured()`) y con `BridgeQueueFullError` si la cola tiene `maxQueueSize` elementos (100 por defecto; `hasCapacity()`, `pendingCount()`, `discord-bridge.client.ts:134-146`). `SuggestionsService` consulta ambos métodos antes de aceptar una sugerencia y responde `503`.

### 2.1 Prevención de Carreras de Conexión
Si múltiples peticiones concurrentes invocan `send()` cuando el socket está desconectado:
- La primera llamada crea `this.connectPromise` e inicia el handshake (`discord-bridge.client.ts:313, 328`).
- Las siguientes peticiones detectan `this.connectPromise` y retornan la misma referencia (`discord-bridge.client.ts:313-315`), evitando la creación de sockets duplicados.

### 2.2 Handshake de Autenticación
Al abrirse el socket (`open`), el cliente emite la trama de acceso inicial (`discord-bridge.client.ts:340-350`):
```json
{
  "type": "LOGIN",
  "data": {
    "id": "<crypto.randomUUID()>",
    "token": "<supertoken>"
  }
}
```
Si el servidor no responde con `LOGIN_SUCCESS` coincidente antes de 10 segundos (`connectTimeoutMs = 10000`, `discord-bridge.client.ts:89, 330-338`), la conexión se aborta con error de tiempo de espera agotado.

### 2.3 Temporizador de Inactividad de 30 Minutos
Para liberar memoria y sockets abiertos en momentos de baja actividad comunitaria:
- Cada trama recibida o transmitida reinicia el temporizador de inactividad (`resetIdleTimeout()`, `discord-bridge.client.ts:606-622`).
- Si transcurren 30 minutos continuos (`idleTimeoutMs = 30 * 60 * 1000 = 1800000 ms`, `discord-bridge.client.ts:87`) sin actividad:
  - Se ejecuta `socket.close(1000, 'Inactivity timeout')` (`discord-bridge.client.ts:610`).
  - La conexión se clausura limpiamente con código normal `1000`.
  - La siguiente petición reconstruirá la conexión de forma transparente vía `ensureConnected()`.

---

## 3. Protocolo de Transmisión en Dos Fases

Para compatibilizar la inmediatez de la API HTTP con la latencia asíncrona de los servidores de Discord, el procesamiento se divide en dos fases desacopladas (`discord-bridge.client.ts:488-604`):

```
[API /suggestions] ────► send(frame) ──► Encola en this.queue
                              │
  ┌───────────────────────────┴─────────────────────────────┐
  │ FASE 1: Ingesta Síncrona en Cola Remota (Bloqueante)     │
  │  - Transmite frame serializado vía socket.send()        │
  │  - Emite evento 'frame:sending'                         │
  │  - Bloquea en pendingPhase1 hasta recibir QUEUED        │
  │  - Servidor Discord responde { type: 'QUEUED', id }     │
  │  - Desencola elemento (queue.shift())                   │
  │  - Resuelve promesa send(): API HTTP responde 202       │
  └───────────────────────────┬─────────────────────────────┘
                              │
  ┌───────────────────────────┴─────────────────────────────┐
  │ FASE 2: Tramitación Asíncrona (No Bloqueante)           │
  │  - Bot de Discord procesa el mensaje en canales/hilos   │
  │  - Notifica vía frame: SUGGESTION_CONFIRMED o FAILED    │
  │  - Puente emite this.emit(frame.type, frame.data)       │
  │  - SuggestionsService suscriptor actualiza el Store     │
  └─────────────────────────────────────────────────────────┘
```

### 3.1 Fase 1: Confirmación de Encolado
1. El método `processQueue()` toma el elemento en la cabeza de la cola (`this.queue[0]`, `discord-bridge.client.ts:499`).
2. Serializa el frame y lo transmite por el WebSocket activo (`discord-bridge.client.ts:514`).
3. Emite el evento de observabilidad `frame:sending` con `{ type: frame.type, id: frame.data.id }` (`discord-bridge.client.ts:515`).
4. Espera a que el servidor remoto confirme la recepción devolviendo una trama con `type: 'QUEUED'` (`discord-bridge.client.ts:449-454, 519`).
5. Una vez recibido `QUEUED`:
   - El elemento se extrae de la cola (`this.queue.shift()`, `discord-bridge.client.ts:521`).
   - Se resuelve la promesa del llamador (`currentItem.resolve()`, `discord-bridge.client.ts:525`).
   - Se agenda la ejecución del siguiente elemento en el microtask loop (`queueMicrotask(() => this.processQueue())`, `discord-bridge.client.ts:601-603`).

### 3.2 Fase 2: Confirmación Tardía de Entrega
La Fase 2 es reactiva y no bloquea la cola secuencial. Los eventos que el bot remoto produce una vez creado el mensaje o hilo en Discord llegan como tramas independientes:
- `SUGGESTION_CONFIRMED`: Notifica la publicación con `channel_id`, `message_id` y `thread_id`.
- `SUGGESTION_FAILED`: Notifica fallos de permisos o de red en Discord con código y motivo.
El cliente WebSocket no mantiene un catálogo cerrado de controladores (*hardcoded handlers*); cualquier trama recibida es emitida dinámicamente (`this.emit(frame.type, frame.data)`, `discord-bridge.client.ts:446`), permitiendo al servicio consumidor registrar listeners específicos.

---

## 4. Gestión de Rate Limit y Límite de 5 Minutos

Cuando el bot de Discord o la API de Discord impone restricciones de tasa de peticiones, el servidor responde con una trama de error:
```json
{
  "type": "ERROR",
  "data": {
    "code": "RATE_LIMITED",
    "retry_after_seconds": 15
  }
}
```

El algoritmo de control de congestión opera según los siguientes pasos (`discord-bridge.client.ts:456-485, 527-566`):

1. **Cálculo de Pausa:** Extrae `retry_after_seconds` (o asume 30 s por defecto si no es numérico) y computa `pauseMs = Math.max(1000, Math.ceil(retryAfter * 1000))` (`discord-bridge.client.ts:458-462`).
2. **Acumulación de Tiempo Transcurrido:** Suma el intervalo al acumulador del elemento: `currentItem.totalRetryElapsedMs += pauseMs` (`discord-bridge.client.ts:463`).
3. **Pausa de la Cola:** Activa `this.isPaused = true` (`discord-bridge.client.ts:465`) y emite el evento `frame:retrying` informando a los suscriptores (`discord-bridge.client.ts:467-471`). Si el elemento posee callback `onRetrying`, lo invoca directamente (`discord-bridge.client.ts:473-475`).
4. **Espera Bloqueante:** Se suspende la ejecución de `processQueue` mediante `await this.sleep(error.pauseMs)` (`discord-bridge.client.ts:528`).
5. **Evaluación de Tiempo Límite Acumulado (5 minutos):**
   - Umbral máximo: `maxRetryDurationMs = 5 * 60 * 1000 = 300000 ms` (`discord-bridge.client.ts:88`).
   - Si `currentItem.totalRetryElapsedMs >= this.maxRetryDurationMs`:
     - Se genera un identificador de incidente forense: `incidentId = crypto.randomUUID()` (`discord-bridge.client.ts:531`).
     - Se registra en `console.error` con formato forense canónico:
       ```
       [INCIDENT <uuid>] Type: RATE_LIMIT_TIMEOUT | Message: Max retry duration (5m) exceeded for frame <id>
       ```
     - Se descarta el elemento definitivamente de la cola (`this.queue.shift()`, `discord-bridge.client.ts:539`).
     - Se restablece la pausa (`this.isPaused = false`, `discord-bridge.client.ts:540`).
     - Se rechaza la promesa del elemento con una instancia de `BridgeRateLimitTimeoutError` conteniendo el `incidentId` (`discord-bridge.client.ts:544`).
     - Se emite el evento `frame:failed` (`discord-bridge.client.ts:545-550`).
     - Se continúa inmediatamente con el despacho de los siguientes elementos encolados (`discord-bridge.client.ts:552-554`).
