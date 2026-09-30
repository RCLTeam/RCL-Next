# Módulo Web: Editorial Home Content & Team of the Week

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Web Predictions ➡️](../../../docs/web/predictions/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/web/src/features/home-content/` y sus componentes visuales asociados en `apps/web/src/site/pages/` implementan la interfaz de usuario, la experiencia de lectura editorial y las herramientas de administración para la publicación de artículos y la selección del quinteto ideal de la jornada (*Team of the Week*) en RCL-Next.

La arquitectura sigue de forma rigurosa el **Golden Standard Modular** del monorepo (`reference/rofl-upload-architecture.md`):

1. **Aislamiento Total de Red en Componentes Visuales (*Dumb UI*):** Todos los componentes alojados en `apps/web/src/features/home-content/components/` contienen estrictamente **0 llamadas a `fetch` y 0 llamadas a `WebSocket`**. Son componentes puramente presentacionales que reciben su estado mediante *props* y emiten eventos a través de *callbacks*, garantizando determinismo, facilidad de testing unitario y aislamiento arquitectónico.
2. **Consumo Headless Desacoplado (`useHomeContent`):** La lógica de comunicación asíncrona, control de concurrencia y cancelación reside en el hook desacoplado `useHomeContent` (`useHomeContent.ts:1-37`). Emplea `AbortController` nativo para cancelar peticiones en vuelo ante desmontajes o cambios de ruta, e implementa seguimiento de revisiones para evitar condiciones de carrera si una respuesta tardía llega desfasada.
3. **Renderizado Seguro de Artículos contra XSS:** El componente de lectura `ArticleView.tsx` renderiza el cuerpo de los artículos parseando párrafos de texto plano en elementos nativos de React (`<p>`, `<h2>`, `<blockquote>`, `<figure>`, `<img>`). **No utiliza `dangerouslySetInnerHTML` bajo ninguna circunstancia**, bloqueando de raíz cualquier vector de ataque por inyección de código o esquemas de URI maliciosos.
4. **Accesibilidad y Respeto al Movimiento Reducido:** El carrusel de splash arts de campeones del quinteto ideal (`WeeklyChampionBackground.tsx`) detecta activamente la preferencia del sistema operativo `(prefers-reduced-motion: reduce)`, deteniendo la rotación automática de imágenes para usuarios con sensibilidad al movimiento.
5. **Paneles de Edición Administrativos con Guardia de Cambios:** `HomeContentPanel.tsx` coordina pestañas de edición con guardia de cambios sin guardar (`window.confirm`), inserción de imágenes inline en la posición exacta del cursor de texto y previsualización en vivo.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación (Dumb UI)** | [components.md](components.md) | Catálogo de componentes visuales puros (`ArticleView`, `ContentField`, `ContentStatus`, `EditorialImagePicker`, `EditorialManager`, `HomeContentPanel`, `WeeklyRoundEditor`, `WeeklyTeamManager`, `EditorialGrid`, `TeamOfTheWeekStrip`, `WeeklyChampionBackground`), props, callbacks y cero red. |
| **Hooks Headless y Cliente API** | [hooks.md](hooks.md) | Hook `useHomeContent`, ciclo de vida con `AbortController`, cliente `home-content-api.ts`, manejo de revisiones concurrentes y reintentos. |
| **Vistas Ensambladoras (Smart Pages)** | [pages.md](pages.md) | Integración en páginas completas: `HomePage.tsx` (portal principal con carrusel y noticias), `EditorialPage.tsx` (modal accesible de lectura) y `AdminPage.tsx` (panel de gestión). |
| **Tipos y Contratos de Interfaz** | [types.md](types.md) | Contratos de interfaz de usuario, tipos de control de pestañas (`EditorStateProps`), modelos de selección semanal y reexportación de contratos de `@rcl/contracts`. |

---

## 3. Garantías de Fiabilidad y Separación de Responsabilidades

- **Cero Red en Dumb Components:** Las carpetas de componentes no contienen dependencias de transporte HTTP ni instanciación de promesas de red.
- **Inmunidad XSS en el Renderizado:** Todas las etiquetas del cuerpo editorial se transforman en nodos de texto estándar de React; las imágenes se filtran mediante expresiones regulares que exigen la ruta del almacén local de RCL.
- **Prevención de Pérdida de Datos:** Los formularios administrativos rastrean el estado sucio (*dirty state*), alertando al usuario antes de conmutar de pestaña o descartar un artículo en redacción.
