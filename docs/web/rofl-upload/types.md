# Tipos y Máquina de Estados de la UI

[⬅️ Volver a Web ROFL Upload](README.md) | [Siguiente: Discord Bridge API ➡️](../../api/discord-bridge/README.md)

---

## 1. Visión General

El estado de la interfaz de subida está gestionado mediante una máquina de estados determinista modelada a través del patrón `useReducer` en `apps/web/src/features/rofl-upload/state/upload-reducer.ts` y fuertemente tipada en `apps/web/src/features/rofl-upload/types/upload.types.ts`.

---

## 2. Definición del Estado (`UploadState`)

```typescript
// apps/web/src/features/rofl-upload/types/upload.types.ts:3-17
export type UploadStage =
  | 'idle'
  | 'queue'
  | 'uploading'
  | 'error'
  | 'decompressing'
  | 'parsing'
  | 'validating'
  | 'persisting'
  | 'completed';

export interface UploadState {
  stage: UploadStage;
  status: UploadStage;
  progress: number;
  queuePosition: number | null;
  queueTotal: number | null;
  terminalLogs: string[];
  anomalies: MultiAccountAnomaly[];
  missingPlayers: string[];
  summary: BatchUploadSummary | null;
  errorMessage: string | null;
  fileName: string | null;
}
```

### Estado Inicial (`initialUploadState`)
```typescript
// apps/web/src/features/rofl-upload/state/upload-reducer.ts:12-24
export const initialUploadState: UploadState = {
  stage: 'idle',
  status: 'idle',
  progress: 0,
  queuePosition: null,
  queueTotal: null,
  terminalLogs: [],
  anomalies: [],
  missingPlayers: [],
  summary: null,
  errorMessage: null,
  fileName: null
};
```

---

## 3. Unión Discriminada de Acciones (`UploadAction`)

El reducer procesa acciones tipadas definidas en `apps/web/src/features/rofl-upload/types/upload.types.ts:19-32` y extendidas en `apps/web/src/features/rofl-upload/state/upload-reducer.ts:3-10`:

| Acción (`type`) | Parámetros Adicionales | Efecto sobre el Estado |
|---|---|---|
| `start` / `started` | `filename: string` | Reinicia el estado, pasa a `stage: 'uploading'`, guarda `fileName` e inicia el log de terminal. |
| `queue` | `position: number, total: number` | Pasa a `stage: 'queue'`, actualiza `queuePosition` y `queueTotal`. |
| `stage` | `stage: UploadStage` | Transiciona la etapa activa (`decompressing`, `parsing`, etc.). |
| `progress` | `percent: number, message: string` | Actualiza la barra de progreso numérico y añade un mensaje descriptivo. |
| `warning` | `message: string` | Registra un aviso de terminal sin interrumpir la etapa en curso. |
| `anomaly` | `anomaly: MultiAccountAnomaly` | Agrega la anomalía al array `anomalies` para renderizado visual. |
| `success` | `summary: BatchUploadSummary` | Pasa a `stage: 'completed'`, asigna el resumen y desbloquea el cierre. |
| `error` | `message: string` | Pasa a `stage: 'error'`, guarda `errorMessage` y parsea `missingPlayers`. |
| `connection_lost` | `code?: number, reason?: string, message?: string` | Traduce el código de desconexión del WebSocket en un mensaje comprensible. |
| `batch_logs` | `logs: string[]` | Concatena en lote los registros de terminal del búfer de 50 ms. |
| `log` | `message: string` | Añade un único mensaje de log individual. |
| `reset` | N/A | Restaura el estado a `initialUploadState`. |

---

## 4. Normalización de Códigos de Desconexión WebSocket

Cuando la conexión del socket se interrumpe de forma controlada o anómala, el reducer traduce el código numérico de RFC 6455 en un mensaje en lenguaje natural orientado al usuario (`upload-reducer.ts:137-161`):

| Código de Cierre | Mensaje Traducido para la UI | Diagnóstico y Remedio |
|:---:|---|---|
| `4001` | *Sesión expirada o no autenticada. Por favor, inicia sesión nuevamente.* | La cookie `rcl_session` es inválida o ha expirado. El usuario debe volver a autenticarse con Discord. |
| `4003` | *Acceso denegado: se requieren permisos de administrador.* | El usuario no posee el rol `admin` ni `owner` en el sistema. |
| `1009` | *El archivo supera el tamaño máximo permitido (50MB).* | La repetición o archivo ZIP transmitido excede la cuota física permitida por el backend. |
| `1006` u otros | *Conexión cerrada inesperadamente con el servidor.* | Caída de red, reinicio del servicio o desconexión abrupta del cliente. |

---

## 5. Extracción de Invocadores No Registrados mediante Expresión Regular

Cuando el backend aborta la subida por la regla de fail-fast de participantes, emite un mensaje formateado:
`Validation failed: The following summoners are not registered in the database: Faker#KR1, Deft#KR1`.

El reducer ejecuta la función auxiliar `extractMissingPlayers()` (`upload-reducer.ts:26-35`):
```typescript
function extractMissingPlayers(message: string): string[] {
  const match = message.match(/not registered in [^:]+:\s*([^\n\r]+)/i);
  if (match?.[1]) {
    return match[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}
```
Esto puebla automáticamente la lista `state.missingPlayers`, permitiendo al componente `MissingPlayersAlert` renderizar los nombres de los jugadores en etiquetas interactivas independientes.
