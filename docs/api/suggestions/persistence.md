# Persistencia en Memoria y Registro Forense de Incidencias

[⬅️ Volver a API Suggestions](README.md) | [Siguiente: Validación ➡️](validation.md)

---

## 1. Visión General

El módulo de sugerencias utiliza un modelo de persistencia volátil en memoria y un sistema de registro de incidencias estructurado hacia la salida de error estándar (`stderr`). 

A diferencia de los módulos de competición o roles que interactúan con esquemas de Drizzle ORM sobre PostgreSQL, el ciclo de vida de una sugerencia es estrictamente efímero y orientado a la entrega: su propósito es asegurar la ingesta, gestionar el estado transitorio de envío y notificar el resultado final al frontend durante las dos horas posteriores a su creación.

---

## 2. Almacén Reactivo en Memoria (`SuggestionStore`)

Implementado en `apps/api/src/modules/suggestions/suggestion.store.ts:40-178`, la clase `SuggestionStore` gestiona las propuestas activas en el heap de Node.js mediante una colección `Map<string, SuggestionRecord>`.

### 2.1 Estructura del Registro (`SuggestionRecord`)
```typescript
export interface SuggestionRecord {
  id: string;
  suggestion: string;
  authorId: string;
  authorUsername: string;
  authorAvatar?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  isAnonymous?: boolean | undefined;
  status: SuggestionStatus;
  createdAt: number;
  updatedAt: number;
  channelId?: number | string | undefined;
  messageId?: number | string | undefined;
  threadId?: number | string | undefined;
  nextRetryInSeconds?: number | undefined;
  incidentId?: string | undefined;
  error?: string | undefined;
}
```

### 2.2 Política de Tiempo de Vida (TTL de 2 Horas)
- **Constante**: `DEFAULT_SUGGESTION_TTL_MS = 2 * 60 * 60 * 1000` (7.200.000 ms = 2 horas) (`suggestion.store.ts:38`).
- **Expiración Pasiva (en Lectura):** Cada llamada a `get(id)` (`suggestion.store.ts:87-98`) calcula `now - record.createdAt`. Si el tiempo transcurrido es igual o superior al TTL, el registro se elimina inmediatamente del mapa (`this.records.delete(id)`) y se retorna `undefined`.
- **Barrido Activo Periódico (en Segundo Plano):**
  - Un temporizador periódico ejecuta `cleanup()` cada 10 minutos (`cleanupIntervalMs = 10 * 60 * 1000 = 600.000 ms`, `suggestion.store.ts:48, 51-58`).
  - El temporizador está configurado con `.unref()` (`suggestion.store.ts:55-57`), asegurando que la existencia del barrido no impida el cierre o apagado limpio del proceso Node.js ante señales del sistema operativo (`SIGTERM`/`SIGINT`).
  - El método `cleanup(now)` itera los registros y purga todos aquellos cuyo `now - record.createdAt >= this.ttlMs`, retornando el número total de registros desalojados (`suggestion.store.ts:140-149`).

### 2.3 Tamaño máximo
- **Constante**: `DEFAULT_SUGGESTION_STORE_MAX_RECORDS = 1000` (`suggestion.store.ts:40`), configurable con la opción `maxRecords`.
- `hasCapacity()` (`suggestion.store.ts:69-75`) indica si cabe un registro más; si el almacén está lleno, primero purga los registros caducados.
- `SuggestionsService.submit()` consulta `hasCapacity()` antes de crear el registro: con el almacén lleno responde `503 SUGGESTIONS_UNAVAILABLE` sin crear el registro ni encolar la trama, de modo que el número de registros nunca supera `maxRecords`.

### 2.4 Métodos Principales de la API del Store
| Método | Firma | Propósito Técnico |
|---|---|---|
| `create` | `create(data): SuggestionRecord` | Inicializa un nuevo registro con timestamps `createdAt` y `updatedAt`, guardándolo en el mapa (`L61-75`). |
| `hasCapacity` | `hasCapacity(now?: number): boolean` | Indica si cabe un registro más bajo `maxRecords`, purgando antes los caducados si está lleno. |
| `get` | `get(id: string): SuggestionRecord \| undefined` | Obtiene un registro aplicando la guarda de expiración pasiva (`L87-98`). |
| `updateStatus` | `updateStatus(id, update): SuggestionRecord \| undefined` | Aplica una transición de estado respetando la inmutabilidad de estados terminales (`L101-127`). |
| `delete` | `delete(id: string): boolean` | Elimina manualmente un registro del almacén (`L129-131`). |
| `cleanup` | `cleanup(now?: number): number` | Ejecuta el barrido activo de registros expirados (`L140-149`). |
| `clear` | `clear(): void` | Vacía todos los registros en memoria (`L155-157`). |
| `close` | `close(): void` | Detiene el temporizador de barrido periódico y purga la memoria (`L163-176`). |

---

## 3. Registro Estructurado de Incidencias (`IncidentLogger`)

Para garantizar la observabilidad y trazabilidad operativa de fallos sin sobrecargar la base de datos relacional con registros transitorios, el módulo dispone de `IncidentLogger` (`apps/api/src/modules/suggestions/incident-logger.ts:1-34`).

### 3.1 Formato Canónico Forense
Todo error clasificado como incidencia técnica emite a `stderr` una línea única formateada según el estándar certificado:
```
[INCIDENT <uuid>] Type: <tipo> | Message: <mensaje>
```
Validado en pruebas unitarias mediante la expresión regular estricta (`incident-logger.test.ts:31`):
```regex
^\[INCIDENT [0-9a-fA-F-]{36}\] Type: .+ \| Message: .+$
```

### 3.2 Generación y Preservación de Identificadores
- Si el llamador ya proporciona un `incidentId` válido (por ejemplo, el generado previamente por `BridgeRateLimitTimeoutError` en el transporte), el logger preserva exactamente ese UUID (`incident-logger.ts:16-20`).
- Si no se proporciona un identificador, genera uno nuevo de forma criptográficamente segura mediante `crypto.randomUUID()`.

### 3.3 Catálogo Canónico de Tipos de Incidencia
| Tipo de Incidencia | Origen Técnico | Causa y Contexto |
|---|---|---|
| **`RATE_LIMIT_TIMEOUT`** | `SuggestionsService.dispatchToBridge` (`suggestions.service.ts:316-326`) | La propuesta superó el límite máximo de 5 minutos continuos acumulados en reintentos por rate limit en Discord. |
| **`BRIDGE_SEND_FAILED`** | `SuggestionsService.dispatchToBridge` (`suggestions.service.ts:316-326`) | Excepción de red, socket inalcanzable, o fallo de transporte al transmitir el frame `SUGGESTION_CREATED` en Fase 1. Para `BridgeUnavailableError` el mensaje incluye la causa original (`describeError`, `suggestions.service.ts:331-337`). |
| **`DISCORD_DELIVERY_FAILED`** | Listener de `SUGGESTION_FAILED` en el constructor (`suggestions.service.ts:115-142`) | El bot de Discord procesó la propuesta en Fase 2 pero devolvió un frame `SUGGESTION_FAILED` (p. ej. canal borrado, permisos insuficientes). Si el bot envía `incident_id`, se registra con ese identificador. |

### 3.4 Separación entre log y respuesta pública
El detalle técnico del fallo (mensajes de socket, hosts, puertos, motivos del bot) solo se escribe en la línea `[INCIDENT <uuid>]` del log. El registro guarda `status: 'failed'` y el `incidentId`, y `GET /api/v1/suggestions/status/:id` devuelve únicamente ese identificador para que el usuario pueda comunicarlo.
