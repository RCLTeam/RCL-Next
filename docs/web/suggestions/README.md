# Módulo Frontend: Buzón de Sugerencias y Diagnóstico de Puente

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Competition API ➡️](../../../docs/api/competition/README.md)

---

## 1. Resumen Ejecutivo

El módulo frontend de sugerencias (`apps/web/src/features/suggestions/`, complementado por `apps/web/src/features/discord-bridge/`) proporciona la experiencia de usuario interactiva para la redacción, validación accesible, envío y seguimiento reactivo de propuestas comunitarias dentro del portal RCL-Next.

La implementación sigue rigurosamente el **Golden Standard de Arquitectura Frontend Desacoplada** del monorepo (separación estricta entre componentes Dumb, hooks desacoplados y páginas Smart):
1. **Componentes Puramente Presentacionales (*Dumb Components*):** Los componentes visuales (`SuggestionForm.tsx`, `SuggestionModal.tsx`) contienen exactamente **0 llamadas a `fetch` y 0 instanciaciones de `WebSocket`**, operando únicamente a través de propiedades (*props*) y callbacks.
2. **Encapsulación de Estado y Efectos (*Headless Hooks*):** Toda la lógica de red, gestión de máquinas de estados, cancelación con `AbortController`, sondeo periódico y cuenta regresiva se aísla en el hook `useSuggestion.ts` y su reducer puro `suggestion-reducer.ts`.
3. **Accesibilidad Nativa con HTML5 `<dialog>`:** El contenedor modal aprovecha el elemento nativo del navegador, proporcionando aislamiento modal (`aria-modal="true"`), captura de foco, cierre mediante teclado (`Escape`), cierre por clic en el fondo (*backdrop*), y restauración automática del elemento enfocado previamente al desmontarse.
4. **Resiliencia Operativa:** Integración con la sonda de salud del puente (`useBridgeHealth`) para alertar al usuario antes de redactar y deshabilitar los envíos si el bot de Discord se encuentra inalcanzable.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación** | [components.md](components.md) | `SuggestionForm.tsx` (Dumb UI, contador de caracteres, banners reactivos, botón de copia de incidentes) y `SuggestionModal.tsx` (accesibilidad `<dialog>`). |
| **Headless Hooks y Reducers** | [hooks.md](hooks.md) | `useSuggestion` (máquina de estados, sondeo de 1 s, tolerancia a 5 errores consecutivos, timer de reintento) y `useBridgeHealth` (sonda con `AbortController`). |
| **Vistas e Integración en Sitio** | [pages.md](pages.md) | Integración global en la barra de navegación del portal (`SiteLayout.tsx`), apertura/cierre de modal y montaje sin polución del DOM. |
| **Contratos de Tipos y Acciones** | [types.md](types.md) | Tipos locales TypeScript (`suggestions.types.ts`), estados de interfaz `SuggestionUIStatus`, uniones discriminadas de acciones y props. |

---

## 3. Garantías de Accesibilidad y Usabilidad

- **Contador Dinámico con Feedback:** El contador de caracteres (`SuggestionForm.tsx:165-170`) actualiza en vivo la longitud respecto al límite (`X / 1000`) y avisa de forma comprensible cuando faltan caracteres para alcanzar el mínimo (`Mínimo 10 caracteres (faltan N)`).
- **Indicadores de Estado en Vivo:** Los cambios de estado durante la tramitación se notifican al usuario mediante un contenedor accesible `<output aria-live="polite">` con spinner animado y textos descriptivos adaptados a cada fase.
- **Trazabilidad en Errores:** Cuando una sugerencia culmina en error con `incidentId`, la interfaz renderiza el código canónico formateado y ofrece un botón de un solo clic que utiliza la API de portapapeles (`navigator.clipboard.writeText`) para que el usuario pueda reportarlo al equipo técnico.
