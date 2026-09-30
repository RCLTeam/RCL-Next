# Validación y Gestión de Errores del Puente Discord

[⬅️ Volver a API Discord Bridge](README.md) | [Siguiente: Contratos ➡️](contracts.md)

---

## 1. Visión General

La capa de transporte WebSocket del puente Discord aplica validaciones fail-fast en la ingesta de tramas salientes, procesamiento seguro ante datos entrantes potencialmente corruptos, y una discriminación estructurada de códigos de error de red y protocolo.

A diferencia de capas HTTP tradicionales basadas en esquemas declarativos (como Zod o TypeBox), las validaciones en el puente son imperativas, de alto rendimiento y orientadas a preservar la resiliencia del canal bidireccional.

---

## 2. Validación de Tramas Salientes (`send`)

Antes de encolar cualquier elemento para su transmisión hacia Discord, el método público `send()` ejecuta una validación de integridad estructural (`discord-bridge.client.ts:423-426`):

```typescript
if (!frame?.data?.id) {
  throw new Error('Frame must contain data.id');
}
```

- **Requisito Obligatorio:** Todo frame transmitido debe proporcionar un identificador no vacío en `data.id`.
- **Propósito:** El identificador es la clave unívoca requerida para emparejar la confirmación de Fase 1 (`QUEUED`) y los eventos de Fase 2 (`SUGGESTION_CONFIRMED`, `SUGGESTION_FAILED`).
- **Consecuencia de Incumplimiento:** La función arroja de inmediato un error síncrono sin encolar la trama y sin emitir tráfico de red.

---

## 3. Manejo Defensivo de Tramas Entrantes (`ws.on('message')`)

La recepción de datos desde el WebSocket remoto está protegida contra cargas útiles maliciosas o malformadas (`discord-bridge.client.ts:358-364, 439-445`):

1. **Decodificación Segura:** La carga entrante (sea `string` o `Buffer`) se decodifica y analiza mediante `JSON.parse(data.toString())` dentro de un bloque `try/catch`.
2. **Tolerancia a Tramas Corruptas:** Si una trama remota no es un JSON válido o carece de la propiedad `type`, el analizador descarta el mensaje silenciosamente sin arrojar excepciones no controladas y sin cerrar abruptamente la conexión de transporte.
3. **Validación de Identificador de Autenticación:** Durante el handshake inicial, la trama de éxito debe cumplir estrictamente `type === 'LOGIN_SUCCESS'` y su campo `data.id` debe coincidir exactamente con el UUID generado localmente (`authId`) para esa sesión (`discord-bridge.client.ts:370-373`). Si el identificador no coincide, el mensaje se ignora.

---

## 4. Clasificación y Jerarquía de Errores

El módulo define y categoriza los errores técnicos en tres familias:

### 4.1 Errores de Protocolo y Rate Limit
- **`RATE_LIMITED`:** Código de error emitido por el bot remoto en una trama `{ "type": "ERROR", "data": { "code": "RATE_LIMITED", "retry_after_seconds": N } }`.
  - No constituye una excepción terminal inmediata.
  - Se traduce internamente a una instancia de `HandledRateLimitError(pauseMs)` (`discord-bridge.client.ts:55-60`), activando la pausa temporal de la cola.
- **`BridgeRateLimitTimeoutError`:** Excepción terminal arrojada cuando el tiempo acumulado de pausas por rate limit para un mismo elemento supera los 5 minutos (`maxRetryDurationMs = 300000 ms`, `discord-bridge.client.ts:45-53`).
  - Incluye la propiedad pública `incidentId: string`.
  - Registra el incidente forense en `console.error`.

### 4.2 Errores de Diagnóstico y Salud (`BridgeHealthStatus`)
Discriminados en `checkHealth()` y consumidos por el router:
- **`connected` (`healthy: true`):** Handshake de socket completado con éxito y supertoken validado.
- **`unreachable` (`healthy: false`):** La URL del WebSocket no está definida en las variables de entorno, la resolución DNS falló, o el socket rechazó la conexión TCP/TLS.
- **`authentication_failed` (`healthy: false`):** El socket se abrió físicamente, pero el servidor remoto cerró la conexión tras el envío del frame `LOGIN`, o no devolvió `LOGIN_SUCCESS` antes del tiempo límite de 5 segundos. Sugiere que el `DISCORD_BRIDGE_SUPERTOKEN` es inválido o no coincide con el configurado en el bot.

### 4.3 Errores de Conexión y Transporte
- **`connectTimeout`:** Arrojado si el socket de trabajo no completa el handshake inicial antes de 10 segundos (`connectTimeoutMs = 10000`).
- **`ECONNRESET` / Cierre Inesperado:** Si el socket se desconecta mientras un elemento aguardaba confirmación en Fase 1, `handleSocketDisconnect(err)` rechaza la promesa pendiente (`discord-bridge.client.ts:624-630`) para evitar que el emisor quede suspendido en espera indefinida.
