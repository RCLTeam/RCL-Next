# Headless Hooks y Gestión de Estado de Sugerencias

[⬅️ Volver a Web Suggestions](README.md) | [Siguiente: Páginas ➡️](pages.md)

---

## 1. Visión General

El comportamiento reactivo, los efectos de red y la sincronización asíncrona del buzón de sugerencias se encuentran completamente encapsulados en dos *Headless Hooks* desacoplados:
- **`useSuggestion.ts` (194 líneas):** Orquesta la máquina de estados local, la cancelación con `AbortController`, el envío de propuestas, el sondeo periódico (*polling*) y la cuenta regresiva en vivo de reintentos.
- **`useBridgeHealth.ts` (88 líneas):** Consulta y monitoriza la disponibilidad operativa del puente de Discord para alertar preventivamente a los usuarios en la interfaz.

---

## 2. Headless Hook Principal: `useSuggestion`

Implementado en `apps/web/src/features/suggestions/hooks/useSuggestion.ts`, gestiona el estado a través de un reducer puro (`suggestionReducer` en `suggestion-reducer.ts:15-112`).

### 2.1 Contrato de Retorno (`UseSuggestionReturn`)
```typescript
export interface UseSuggestionReturn {
  id?: string | undefined;
  suggestionId?: string | undefined;
  status: SuggestionUIStatus;             // 'idle' | SuggestionStatus
  incidentId?: string | undefined;
  error?: string | undefined;
  countdown?: number | undefined;
  nextRetryInSeconds?: number | undefined;
  isSubmitting: boolean;
  isPolling: boolean;
  submitSuggestion: (req: CreateSuggestionRequest) => Promise<{ id: string }>;
  submit?: (req: CreateSuggestionRequest) => Promise<undefined | { id: string }>;
  reset: () => void;
}
```

### 2.2 Ciclo de Vida y Limpieza Defensiva
El hook protege contra fugas de memoria y actualizaciones de estado sobre componentes desmontados (*unmounted state updates*):
1. **Referencias de Control:** Emplea `isMountedRef` y `activeControllerRef` (`useSuggestion.ts:13-14`).
2. **Cancelación Automática:** Toda petición HTTP en vuelo (`fetch`) está vinculada al `signal` del `AbortController` activo. Si el usuario cierra el modal o cambia de página, la petición se cancela de forma inmediata (`useSuggestion.ts:44-51`).
3. **Limpieza de Temporizadores (`stopTimers`):** Cancela sistemáticamente las referencias activas de `pollTimerRef` y `countdownTimerRef` mediante `clearTimeout` e `clearInterval` (`useSuggestion.ts:20-29`).

### 2.3 Algoritmo de Sondeo Periódico Inteligente (`startPolling`)
Una vez aceptada la propuesta por el servidor (HTTP 202), `startPolling(id)` inicia el seguimiento (`useSuggestion.ts:54-116`):
- **Intervalo:** Consulta cada 1000 ms (`POLLING_INTERVAL_MS = 1000`, `L7`).
- **Invocación:** Realiza llamadas a `getSuggestionStatus(id, signal)` con `credentials: 'include'` y `Cache-Control: 'no-store'`.
- **Detección de Fin de Ciclo:** Si la respuesta contiene un estado terminal (`confirmed` o `failed`), detiene de inmediato el sondeo y actualiza la interfaz (`L88-91`).
- **Tolerancia a Errores Transitorios:**
  - Registra fallos consecutivos en `consecutiveErrorsRef` (`L100-110`).
  - Tolera hasta 5 fallos temporales de conexión (`MAX_CONSECUTIVE_POLL_ERRORS = 5`, `L8`).
  - Si se acumulan 5 errores seguidos sin respuesta satisfactoria, aborta el sondeo y transiciona el estado a `failed` con el mensaje:
    ```
    "Error persistente de conexión al consultar el estado."
    ```

### 2.4 Cuenta Regresiva Reactiva en Vivo
Cuando el backend devuelve un estado `retrying` con `nextRetryInSeconds`:
- El hook detecta la condición e inicia un temporizador periódico de 1 segundo (`useSuggestion.ts:120-139`).
- Cada segundo despacha la acción `COUNTDOWN_TICK` hacia el reducer, decrementando la propiedad `countdown` hasta alcanzar cero.
- Esto proyecta en la interfaz un temporizador descendente fluido (`Reintentando en 14 segundos...`, `13...`, `12...`), ofreciendo total transparencia ante las pausas anti-avalancha impuestas por Discord.

---

## 3. Reducer Puro de Estados: `suggestionReducer`

Ubicado en `apps/web/src/features/suggestions/state/suggestion-reducer.ts`, procesa transiciones deterministas sin efectos colaterales:

| Acción | Efecto en el Estado |
|---|---|
| **`SUBMIT_START`** | `isSubmitting = true`, `error = undefined`, `incidentId = undefined`. |
| **`SUBMIT_SUCCESS`** | `isSubmitting = false`, `isPolling = true`, almacena `id` y fija `status = 'queued'`. |
| **`SUBMIT_ERROR`** | `isSubmitting = false`, `isPolling = false`, `status = 'failed'`, almacena `error`. |
| **`STATUS_POLL_RESULT`** | Actualiza `status`, almacena `incidentId` y `error` si existen; si el estado es terminal, apaga `isPolling = false`. Sincroniza `countdown = nextRetryInSeconds`. |
| **`POLL_ERROR`** | Si `terminal === true`, desactiva el sondeo y marca `status = 'failed'`. |
| **`COUNTDOWN_TICK`** | Si `countdown > 0`, decrementa en 1 unidad: `Math.max(0, countdown - 1)`. |
| **`RESET`** | Restablece el estado completo a `initialSuggestionState` (`status: 'idle'`). |

---

## 4. Hook de Diagnóstico: `useBridgeHealth`

Ubicado en `apps/web/src/features/discord-bridge/hooks/useBridgeHealth.ts`, ofrece observabilidad del estado de conexión del bot:
- **Ejecución al Montar:** Dispara la comprobación `fetchBridgeHealth()` mediante un efecto de inicialización (`L20-37`).
- **Manejo de AbortController:** Pasa la señal de cancelación a la llamada `fetch` para evitar actualizaciones colaterales si el componente se desmonta antes de recibir la respuesta HTTP 200/503.
- **Objeto de Retorno:**
  ```typescript
  export interface UseBridgeHealthReturn {
    data: BridgeHealthResponse | null;
    isHealthy: boolean;
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
  }
  ```
- **Resiliencia de Red:** Si la API devuelve HTTP 503 o si la red es inalcanzable, la función auxiliar `fetchBridgeHealth()` captura el error y retorna de manera segura un objeto normalizado con `healthy: false` y `status: 'unreachable'`, impidiendo que la aplicación colapse.
