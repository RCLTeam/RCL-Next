# Componentes de Presentación Puros (Dumb UI)

[⬅️ Volver a Web ROFL Upload](README.md) | [Siguiente: Headless Hook ➡️](hooks.md)

---

## 1. Visión General

Todos los componentes de presentación visual de la feature de subida ROFL residen en la carpeta `apps/web/src/features/rofl-upload/components/`. Siguiendo el estándar de arquitectura modular del repositorio (*Golden Standard*), estos componentes son **estrictamente presentacionales (*Dumb Components*)**:
- **Cero Llamadas de Red:** Ningún componente realiza llamadas a la API mediante `fetch`, `axios` o instancias directas de `WebSocket`.
- **Cero Side-Effects No Visuales:** No manejan lógica de negocio, reintentos ni transformaciones complejas de datos; consumen *props* tipadas y delegan las acciones del usuario a través de funciones *callback*.

---

## 2. Catálogo de Componentes Visuales

### 2.1 `RoflDropzone.tsx`
Componente accesible para la selección y arrastre de archivos desde el explorador del sistema operativo:
- **Props:** `{ onFileSelected: (file: File) => void }`.
- **Formatos Aceptados:** Archivos con extensión `.rofl` y paquetes comprimidos `.zip`.
- **Comportamiento:** Maneja eventos nativos `onDragOver`, `onDragLeave` y `onDrop`. Cuando el usuario suelta un archivo válido o lo selecciona mediante el botón del diálogo nativo, invoca inmediatamente el callback `onFileSelected(file)`.
- **Auditoría de Red:** **0 llamadas `fetch` / 0 `WebSocket`**.

### 2.2 `UploadStepper.tsx`
Componente encargado de visualizar las fases de progreso, la posición en cola y los registros de terminal en tiempo real:
- **Props:**
  - `stage: UploadStage` (etapa activa actual: `uploading`, `queue`, `decompressing`, `parsing`, `validating`, `persisting`, `completed`, `error`).
  - `progress: number` (porcentaje acumulado de la fase de subida de 0 a 100).
  - `queuePosition: number | null` (posición en la cola FIFO si hay tareas concurrentes).
  - `queueTotal: number | null` (total de clientes en espera).
  - `terminalLogs: string[]` (array con el historial de eventos y logs descriptivos).
  - `fileName: string | null` (nombre del archivo en proceso).
- **Consola de Terminal:** Renderiza una ventana de terminal con diseño oscuro y auto-scroll vertical que muestra los mensajes de avance recibidos del servidor.
- **Auditoría de Red:** **0 llamadas `fetch` / 0 `WebSocket`**.

### 2.3 `MissingPlayersAlert.tsx`
Componente de advertencia mostrado cuando la validación fail-fast del backend detecta invocadores no federados en la base de datos:
- **Props:** `{ missingPlayers: string[] }`.
- **Visualización:** Renderiza una pancarta de alerta de alta prioridad (`role="alert"`) que desglosa a los invocadores ausentes en etiquetas visuales (*chips* o *badges*). Informa al administrador de los nombres exactos `RiotId#Tag` que deben ser registrados en el sistema antes de reintentar la subida.
- **Auditoría de Red:** **0 llamadas `fetch` / 0 `WebSocket`**.

### 2.4 `AnomalyAlerts.tsx`
Componente de alerta informativa de seguridad deportiva:
- **Props:** `{ anomalies: MultiAccountAnomaly[] }`.
- **Visualización:** Itera sobre la lista de anomalías multi-cuenta detectadas por el backend. Por cada incidencia, renderiza una tarjeta que identifica:
  - Nombre del archivo de repetición (`gameFile`).
  - Usuario de Discord implicado (`discordUsername` e identificador de snowflake).
  - Listado de cuentas simultáneas utilizadas en la misma partida y los campeones seleccionados por cada una.
- **Auditoría de Red:** **0 llamadas `fetch` / 0 `WebSocket`**.

### 2.5 `BatchSummaryCard.tsx`
Tarjeta resumen de cierre mostrada al finalizar exitosamente la transacción:
- **Props:** `{ summary: BatchUploadSummary }`.
- **Métricas Renderizadas:**
  - Número de partidas procesadas e insertadas (`processedGames`).
  - Total de usuarios de Discord detectados en el roster (`detectedDiscordUsersCount`).
  - Total de perfiles de invocador únicos participantes (`detectedPlayersCount`).
  - Listado de partidas omitidas por duplicidad (`skippedDuplicates`), si las hubo.
- **Auditoría de Red:** **0 llamadas `fetch` / 0 `WebSocket`**.

---

## 3. Panel Ensamblador de la Feature (`RoflUploadPanel.tsx`)

`RoflUploadPanel.tsx` es el componente coordinador de nivel superior de la feature:
```tsx
// apps/web/src/features/rofl-upload/components/RoflUploadPanel.tsx:14-16
export function RoflUploadPanel({ wsUrl }: RoflUploadPanelProps) {
  const { state, uploadFile, reset } = useRoflUploadWs({ wsUrl });
  ...
}
```
- **Responsabilidad Única:** Conecta el headless hook `useRoflUploadWs` con los componentes presentacionales.
- **Distribución Condicional de Vistas:**
  - Si el estado es `'idle'`: renderiza `RoflDropzone`.
  - Si el estado está en progreso o completado: renderiza `UploadStepper`.
  - Si hay anomalías: monta `AnomalyAlerts`.
  - Si se detectan invocadores ausentes en error: monta `MissingPlayersAlert`.
  - Si la subida fue exitosa: monta `BatchSummaryCard` y botón para cargar otro archivo.
- **Auditoría de Red:** No instancia sockets ni peticiones HTTP directamente; consume exclusivamente los métodos `uploadFile` y `reset` expuestos por el hook.
