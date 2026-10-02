# Contratos de Tipos y Acciones Frontend de Sugerencias

[⬅️ Volver a Web Suggestions](README.md) | [Siguiente: Competition API ➡️](../../api/competition/README.md)

---

## 1. Visión General

Los tipos de datos específicos del módulo frontend de sugerencias se declaran en `apps/web/src/features/suggestions/types/suggestions.types.ts` (73 líneas), integrando y extendiendo los contratos compartidos de `@rcl/contracts`.

Estos tipos modelan el estado visual de la interfaz, el catálogo estricto de acciones del reducer y la interfaz de comunicación de los hooks.

---

## 2. Tipos de Estado de la Interfaz

### 2.1 Estado Visual Discriminado (`SuggestionUIStatus`)
Extiende la unión del backend (`SuggestionStatus`) incorporando el estado pasivo inicial:
```typescript
export type SuggestionUIStatus = SuggestionStatus | 'idle';
```
- **`'idle'`**: El formulario se encuentra en reposo, listo para que el usuario escriba su propuesta.

### 2.2 Estructura del Estado del Reducer (`SuggestionState`)
```typescript
export interface SuggestionState {
  id?: string | undefined;
  suggestionId?: string | undefined;
  status: SuggestionUIStatus;
  incidentId?: string | undefined;
  error?: string | undefined;
  countdown?: number | undefined;
  nextRetryInSeconds?: number | undefined;
  isSubmitting: boolean;
  isPolling: boolean;
}
```

- **`id` / `suggestionId`**: Identificador UUID devuelto por la API en la respuesta HTTP 202.
- **`status`**: Estado actual en la máquina de estados visual (`'idle'`, `'queued'`, `'sending'`, `'processing'`, `'retrying'`, `'confirmed'`, `'failed'`).
- **`incidentId`**: Código de incidente forense reportado por el backend ante un fallo terminal.
- **`error`**: Mensaje de error formateado para su lectura en la interfaz.
- **`countdown`**: Contador numérico en segundos decrementado reactivamente por `COUNTDOWN_TICK`.
- **`nextRetryInSeconds`**: Tiempo de espera original devuelto en la trama de rate limit.
- **`isSubmitting`**: Booleano activo durante la petición HTTP inicial `POST /api/v1/suggestions`.
- **`isPolling`**: Booleano activo mientras se ejecutan consultas periódicas `GET /status/:id`.

---

## 3. Catálogo de Acciones del Reducer (`SuggestionAction`)

La unión discriminada de acciones soportadas por `suggestionReducer` (`suggestions.types.ts:29-57`) incluye soporte para nombres canónicos en mayúsculas y alias compatibles:

```typescript
export type SuggestionAction =
  | { type: 'SUBMIT_START' | 'submit_start' }
  | {
      type: 'SUBMIT_SUCCESS' | 'submit_success' | 'submitted';
      id?: string;
      suggestionId?: string;
      status?: SuggestionStatus;
    }
  | { type: 'SUBMIT_ERROR' | 'submit_error'; error: string }
  | {
      type: 'STATUS_POLL_RESULT' | 'poll_update' | 'status_update';
      id?: string;
      suggestionId?: string;
      status?: SuggestionStatus;
      nextRetryInSeconds?: number | undefined;
      countdown?: number | undefined;
      incidentId?: string | undefined;
      error?: string | undefined;
      payload?: {
        id?: string;
        status: SuggestionStatus;
        nextRetryInSeconds?: number | undefined;
        incidentId?: string | undefined;
        error?: string | undefined;
      };
    }
  | { type: 'POLL_ERROR' | 'poll_error'; error: string; terminal?: boolean }
  | { type: 'COUNTDOWN_TICK' | 'tick_countdown' }
  | { type: 'RESET' | 'reset' };
```

---

## 4. Contratos de Retorno de Hooks

### 4.1 `UseSuggestionReturn`
Define la superficie de API expuesta por el hook `useSuggestion`:
```typescript
export interface UseSuggestionReturn {
  id?: string | undefined;
  suggestionId?: string | undefined;
  status: SuggestionUIStatus;
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

### 4.2 `UseBridgeHealthReturn`
Ubicado en `apps/web/src/features/discord-bridge/types/bridge.types.ts`, define la respuesta del monitor de salud del bot:
```typescript
export interface UseBridgeHealthReturn {
  data: BridgeHealthResponse | null;
  isHealthy: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  // Alias de conveniencia compatibles hacia atrás
  healthy?: boolean;
  status?: BridgeHealthStatus | 'loading';
  message?: BridgeHealthMessage | string;
  details?: string | undefined;
  loading?: boolean;
  checkHealth?: () => Promise<BridgeHealthResponse>;
}
```
