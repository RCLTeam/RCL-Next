# Módulo Frontend de Subida ROFL (Web Feature)

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Discord Bridge API ➡️](../../../docs/api/discord-bridge/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/web/src/features/rofl-upload/` proporciona la interfaz de usuario interactiva y la lógica de estado del lado del cliente para la subida y monitorización de repeticiones en el portal administrativo de RCL-Next.

La arquitectura de este módulo sigue el principio de diseño de **separación estricta de responsabilidades (Golden Standard)**:
1. **Componentes Puramente Presentacionales (*Dumb UI*):** Encapsulados en `components/`, no realizan llamadas de red (`fetch` o `WebSocket`) ni gestionan efectos asíncronos complejos; reciben su estado mediante *props* y emiten eventos mediante *callbacks*.
2. **Hook Desacoplado (*Headless Hook*):** Toda la lógica de conexión WebSocket, fragmentación binaria en 64 KB, manejo de contrapresión de búfer de red y debouncing de registros de terminal reside exclusivamente en `hooks/useRoflUploadWs.ts`.
3. **Máquina de Estados y Reducer:** Enrutamiento determinista de transiciones (`idle` $\rightarrow$ `uploading` $\rightarrow$ `parsing` $\rightarrow$ `persisting` $\rightarrow$ `completed`) y normalización de errores en `state/upload-reducer.ts`.
4. **Montaje Administrativo (*Smart Page*):** Integrado de forma protegida en el panel de administración central (`AdminPage.tsx`).

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación (Dumb UI)** | [components.md](components.md) | Catálogo de componentes visuales puros (`AnomalyAlerts`, `BatchSummaryCard`, `MissingPlayersAlert`, `RoflDropzone`, `UploadStepper`, `RoflUploadPanel`), contratos de *props* y cero dependencias de red. |
| **Headless Hook WebSocket** | [hooks.md](hooks.md) | Especificación de `useRoflUploadWs.ts`, fragmentación en 64 KB, mitigación de contrapresión (>256 KB) con timeout de 15s y debounce de logs a 50 ms. |
| **Enrutamiento y Montaje de Página** | [pages.md](pages.md) | Resolución de la ruta `/admin/rofl/upload`, integración en `AdminPage.tsx:54` bajo `<RequireAdmin>` e integración directa en `AdminPage` (ausencia de `RoflUploadPage.tsx`). |
| **Tipos y Máquina de Estados** | [types.md](types.md) | Contratos de interfaz `UploadState`, `UploadAction`, etapas `UploadStage` y mapeo de códigos de cierre WebSocket (4001, 4003, 1009, 1006). |

---

## 3. Principios de Interfaz y Experiencia de Usuario

1. **Rendimiento a 60 FPS:** Los registros de consola de terminal generados en cada fragmento binario se agrupan en lotes cada 50 ms mediante un búfer en memoria (`bufferedLogsRef`), evitando cascadas masivas de re-renderizado en React.
2. **Retroalimentación Granular:** La interfaz muestra en tiempo real el progreso de subida porcentual, la posición en la cola de descompresión si hay concurrencia, las etapas del pipeline y chips visuales interactivos de invocadores faltantes en caso de fallo.
3. **Control de Flujo de Red:** El cliente detecta la saturación del búfer del socket (`bufferedAmount > 256 KB`) y suspende el bucle de transmisión local, impidiendo que clientes con conexiones lentas congelen la memoria del navegador.
