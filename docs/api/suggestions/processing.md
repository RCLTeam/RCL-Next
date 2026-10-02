# Pipeline de Procesamiento y Máquina de Estados de Sugerencias

[⬅️ Volver a API Suggestions](README.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General

El servicio de sugerencias (`SuggestionsService`, implementado en `apps/api/src/modules/suggestions/suggestions.service.ts:34-289`) coordina el ciclo de vida de las propuestas comunitarias actuando como intermediario entre las peticiones HTTP y el cliente de transporte WebSocket del puente Discord.

Para evitar retrasos en la experiencia del usuario y tolerar la latencia intrínseca de Discord, la arquitectura desacopla completamente la recepción HTTP de la entrega física mediante despacho en segundo plano (*background dispatch*), sincronizando el avance a través de una máquina reactiva de seis estados.

---

## 2. Máquina de Estados Finita (6 Estados)

Cada propuesta transiciona a través de la unión canónica `SuggestionStatus` (`packages/contracts/src/suggestions.ts:6-12`):

```
                       [POST /suggestions]
                                │
                                ▼
                           ┌──────────┐
                           │  queued  │ (202 Accepted inmediato)
                           └────┬─────┘
                                │ (Puente emite frame:sending)
                                ▼
                           ┌──────────┐
                     ┌────►│ sending  │
                     │     └────┬─────┘
                     │          │
                     │   ¿Respuesta remota?
  (Puente emite      │          ├───────────────────────┐
   frame:retrying)   │          │ (Recibe QUEUED)       │ (RATE_LIMITED)
                     │          ▼                       ▼
                     │     ┌────────────┐          ┌──────────┐
                     └─────┤ processing │          │ retrying │
                           └────┬───────┘          └────┬─────┘
                                │                       │
                   ¿Evento tardío en Fase 2?            │ (Excede 5m timeout)
                   ├────────────┴───────────┐           │
                   ▼                        ▼           ▼
             ┌───────────┐            ┌────────────────────┐
             │ confirmed │            │       failed       │
             └───────────┘            └────────────────────┘
             (Estado Terminal)          (Estado Terminal)
```

### 2.1 Descripción Detallada de Estados

| Estado | Tipo | Desencadenante Técnico | Observabilidad y Metadatos |
|---|---|---|---|
| **`queued`** | Transitorio | Inserción inicial en `SuggestionStore` dentro del método `submit()` (`suggestions.service.ts:148-154`). | Propuesta registrada en memoria; API devuelve HTTP 202. |
| **`sending`** | Transitorio | El cliente WebSocket toma el frame de la cola y lo envía a través del socket; emite evento `frame:sending` (`suggestions.service.ts:59-68`). | El frame viaja por la red hacia el bot de Discord. |
| **`processing`** | Transitorio | El bot remoto acusa recibo del frame devolviendo la trama `{ type: 'QUEUED' }` (Fase 1 completada, `suggestions.service.ts:264-268`). | La propuesta está en manos del bot, pendiente de crear mensaje/hilo en Discord. |
| **`retrying`** | Transitorio | El bot devuelve `{ type: 'ERROR', data: { code: 'RATE_LIMITED', retry_after_seconds } }`; el puente emite `frame:retrying` (`suggestions.service.ts:70-83`). | Incorpora `nextRetryInSeconds` en el registro para el contador del frontend. |
| **`confirmed`** | **Terminal** | El bot completa la publicación en Discord y emite `SUGGESTION_CONFIRMED` (Fase 2, `suggestions.service.ts:85-102`). | Almacena `channelId`, `messageId` y `threadId`. Éxito definitivo. |
| **`failed`** | **Terminal** | Fallo de conexión en Fase 1 (`BRIDGE_SEND_FAILED`), timeout de 5m por rate limit (`RATE_LIMIT_TIMEOUT`), o rechazo remoto en Fase 2 (`SUGGESTION_FAILED`) (`suggestions.service.ts:104-123, 270-287`). | Genera y almacena `incidentId` forense y mensaje `error`. Fracaso definitivo. |

---

## 3. Invariante de Inmutabilidad de Estados Terminales

Para garantizar consistencia ante llegadas desordenadas de eventos de red (*out-of-order delivery*):
- Los estados `'confirmed'` y `'failed'` son catalogados como terminales mediante la función auxiliar `isTerminalStatus(status)` (`suggestion.store.ts:3-5`).
- Al invocar `store.updateStatus(id, update)` (`suggestion.store.ts:101-127`), se aplica una guarda estricta:
  ```typescript
  if (isTerminalStatus(current.status) && !isTerminalStatus(update.status)) {
    return current; // Ignora regresiones a estados en vuelo
  }
  ```
- Si un registro ya fue marcado como `confirmed` o `failed`, cualquier evento posterior tardío que intente degradarlo a `processing`, `sending` o `retrying` es descartado en silencio.

---

## 4. Despacho en Segundo Plano (*Background Dispatch*)

El método `submit(text, options)` (`suggestions.service.ts:127-163`) ejecuta el siguiente flujo:
1. Valida imperativamente la longitud del texto.
2. Resuelve la autoría mediante `this.resolveAuthor(options)`.
3. Genera un identificador único UUID: `id = crypto.randomUUID()`.
4. Almacena el registro inicial en `this.store.create({ id, suggestion: text, ... })`.
5. Ejecuta el despacho hacia el puente de forma desacoplada:
   ```typescript
   void this.dispatchToBridge(id, text, author);
   ```
6. Retorna inmediatamente la tupla `{ id, status: 'queued' }` al router HTTP.

En `dispatchToBridge(id, text, author)` (`suggestions.service.ts:243-288`):
- Se construye la trama `BridgeSuggestionCreatedFrame` con la carga útil completa.
- Se invoca `await this.bridgeClient.send(frame)`.
- Si `send()` se resuelve con éxito (Fase 1 completada con acuse `QUEUED`), actualiza el estado a `'processing'`.
- Si ocurre una excepción:
  - Si el error es `BridgeRateLimitTimeoutError`, extrae el `error.incidentId` existente y registra `RATE_LIMIT_TIMEOUT` en `logger`.
  - Si es otro error de transporte, genera un nuevo UUID de incidente y registra `BRIDGE_SEND_FAILED`.
  - Actualiza el registro en `store` a `'failed'` con el `incidentId` y el mensaje de error correspondiente.

---

## 5. Algoritmo de Resolución de Autoría (`resolveAuthor`)

La identidad del autor se computa en `suggestions.service.ts:211-241` bajo las siguientes reglas de negocio:

### 5.1 Caso Usuario Autenticado y No Anónimo
Condición: `options.user !== null && options.isAnonymous !== true`.
- **`author_id`**: Identificador de Discord del usuario (`user.discordId`).
- **`author_username`**: Nombre público resuelto (`user.globalName || user.username || 'Usuario'`).
- **`author_avatar`**: Hash de avatar de Discord (`user.avatarHash`).
- **`avatar_url`**: URL canónica en la CDN de Discord:
  ```
  https://cdn.discordapp.com/avatars/${authorId}/${user.avatarHash}.png
  ```
  (O la URL directa si el campo ya empieza por `http`).

### 5.2 Caso Envío Anónimo o Usuario No Autenticado
Condición: `options.isAnonymous === true || options.user == null`.
- **`author_id`**: `'0'`
- **`author_username`**: `'Anónimo'`
- **`author_avatar`**: `null`
- **`avatar_url`**: `null`

Esta sanitización asegura que ninguna cabecera de sesión o dato de perfil del usuario viaje en el payload hacia Discord cuando se solicita el modo anónimo.
