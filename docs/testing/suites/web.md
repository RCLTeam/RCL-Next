# Catálogo de Suites de Pruebas: Frontend Web

[⬅️ Volver a Suites de Pruebas](README.md) | [Siguiente: Suites del Parser ➡️](parser.md)

---

## 1. Resumen Ejecutivo

El frontend de RCL-Next (`apps/web`) cuenta con **21 suites de pruebas unitarias y de componentes**, que ejecutan **127 pruebas automáticas** distribuidas en **2.388 líneas de código**. Estas pruebas operan bajo Vitest y el entorno simulado de DOM/Node, validando la separación estricta de responsabilidades del Golden Standard: desacoplamiento entre componentes visuales puros (*Dumb UI*), *headless hooks*, reducers de estado puro, adaptadores de cliente API y servicios de activos externos de Riot Games (DataDragon y CommunityDragon).

---

## 2. Inventario de Suites de `apps/web`

| # | Archivo de Prueba | Pruebas | Líneas (LoC) | Área / Característica | Alcance y Aserciones Principales |
|---|---|---:|---:|---|---|
| 1 | `apps/web/src/features/competition/api/competition-detail-api.test.ts` | 5 | 56 | API Competición | Cliente de red para detalles de equipos y jugadores, paso de señales de cancelación (`AbortSignal`) y manejo de respuestas JSON tipadas. |
| 2 | `apps/web/src/features/crud-operations/api/crud-delete-api.test.ts` | 3 | 73 | API CRUD Delete | Solicitud de previsualización de dependencias de borrado en cascada, validación de tokens de sesión y captura de errores HTTP 409 Conflict. |
| 3 | `apps/web/src/features/crud-operations/components/CrudDeleteDialog.test.tsx` | 4 | 97 | Componente CRUD | Renderizado accesible de diálogo modal de confirmación, listado de entidades bloqueantes asociadas y emisión de callback `onConfirm`. |
| 4 | `apps/web/src/features/database-transfer/components/DatabaseTransferPanel.test.tsx` | 3 | 55 | Componente DB Transfer | Controles de interfaz para exportación e importación de volcados `.dump`, estados visuales de progreso y bloqueo de botones durante la transferencia. |
| 5 | `apps/web/src/features/discord-bridge/api/bridge-api.test.ts` | 7 | 136 | API Discord Bridge | Consultas de salud del puente (`/api/v1/bridge/health`), sincronización manual y manejo de respuestas de error. |
| 6 | `apps/web/src/features/discord-bridge/hooks/useBridgeHealth.test.ts` | 5 | 116 | Hook Discord Bridge | Hook reactivo que sondea el estado de conexión del bot de Discord aplicando retroceso exponencial (*exponential backoff*) y reintentos ante desconexión. |
| 7 | `apps/web/src/features/home-content/components/ArticleView.test.tsx` | 2 | 44 | Componente Noticias | Vista de lectura de artículos editoriales, renderizado de títulos, contenido formateado, fecha y cierre de vista modal. |
| 8 | `apps/web/src/features/suggestions/api/suggestions-api.test.ts` | 8 | 165 | API Sugerencias | Cliente HTTP para el envío de propuestas ciudadanas, polling de confirmación de recepción y captura de respuestas HTTP 202/400/429. |
| 9 | `apps/web/src/features/suggestions/components/SuggestionForm.test.tsx` | 9 | 124 | Formulario Sugerencias | Validación en tiempo real del límite de caracteres, deshabilitación de envío con campos vacíos y visualización de mensajes de error accesibles. |
| 10 | `apps/web/src/features/suggestions/components/SuggestionModal.test.tsx` | 4 | 49 | Modal Sugerencias | Contenedor de diálogo accesible (tecla Escape, foco atrapado, aria-modal) que encapsula el formulario de propuestas. |
| 11 | `apps/web/src/features/suggestions/hooks/useSuggestion.test.ts` | 4 | 114 | Hook Sugerencias | Headless hook que coordina el ciclo de vida asíncrono de una propuesta (`idle -> submitting -> queued -> confirmed`), aislando la lógica de red de los componentes visuales. |
| 12 | `apps/web/src/features/suggestions/m4-modal-layout-stress.test.tsx` | 20 | 579 | Estrés de Layout | Batería intensiva de pruebas de estrés para el modal en diversos viewports (móvil, tablet, escritorio amplio), comprobando que textos extensos no causen desbordamiento visual (*overflow*). |
| 13 | `apps/web/src/features/suggestions/state/suggestion-reducer.test.ts` | 13 | 228 | Reducer Sugerencias | Función reductora pura de la máquina de estados de propuestas: transiciones deterministas, inmutabilidad del estado y reinicio a valores iniciales. |
| 14 | `apps/web/src/shared/display-name.test.ts` | 2 | 12 | Utilidad Nombres | Sanitización y formateo de nombres de usuario en Discord, soporte de caracteres unicode, emojis y fuentes decorativas. |
| 15 | `apps/web/src/shared/riot/community-dragon.service.test.tsx` | 20 | 68 | Servicio CommunityDragon | Resolución de URLs de iconos de posiciones de juego (top, jungle, mid, adc, support), mapeo de nombres abreviados y URLs de respaldo (*fallbacks*). |
| 16 | `apps/web/src/shared/riot/data-dragon.service.test.ts` | 6 | 137 | Servicio Data Dragon | Consulta de versión activa de parches de League of Legends, obtención y caché en memoria de catálogos de campeones, objetos y runas reforzadas. |
| 17 | `apps/web/src/site/layout/SiteLayout.test.tsx` | 1 | 21 | Layout General | Montaje del caparazón estructural de la aplicación: barra de navegación superior, contenedor principal de vista y pie de página. |
| 18 | `apps/web/src/site/pages/champions/ChampionsTable.test.tsx` | 3 | 56 | Página Campeones | Tabla de estadísticas de campeones de la liga: ordenación por columnas (partidas, victorias, KDA), filtrado y estado vacío. |
| 19 | `apps/web/src/site/pages/players/PlayersPage.test.tsx` | 4 | 174 | Página Jugadores | Catálogo general de jugadores, selector de temporada/división, podio de aspirantes a MVP y filtrado por rol en equipo. |
| 20 | `apps/web/src/site/pages/predictions/PredictionCard.test.tsx` | 2 | 53 | Tarjeta Predicciones | Componente interactivo para emitir votos en series Bo1/Bo3/Bo5, selección de marcador y estado bloqueado tras el cierre de jornada. |
| 21 | `apps/web/src/site/routes.test.tsx` | 2 | 31 | Enrutamiento Global | Resolución del mapa de rutas (`/`, `/competition`, `/teams`, `/players`, `/predictions`, `/admin`), parámetros dinámicos de URL y ruta 404. |

---

## 3. Estrategia de Cobertura Frontend Externa

1. **Funcionalidad `auth` (`apps/web/src/features/auth/`):**
   - *Ausencia en carpeta local:* Cero archivos `*.test.tsx` directos dentro de `features/auth/`.
   - *Dónde se prueba:* En `tests/unit/render/AuthControls.test.tsx` (6 pruebas, 64 LoC), que valida el botón de inicio de sesión de Discord, la visualización del avatar del usuario autenticado y las opciones del menú de desconexión.
2. **Funcionalidad `rofl-upload` (`apps/web/src/features/rofl-upload/`):**
   - *Ausencia en carpeta local:* Cero archivos `*.test.tsx` directos dentro de `features/rofl-upload/`.
   - *Dónde se prueba:* En `tests/unit/useRoflUploadWs.test.ts` (13 pruebas, 222 LoC) para toda la orquestación del hook de streaming binario y en `tests/unit/render/rofl-upload.test.tsx` (6 pruebas, 97 LoC) para la interfaz de arrastrar y soltar repeticiones.
3. **Páginas `crystal-ball` y `fantasy`:**
   - *Ausencia de pruebas dedicadas:* No cuentan con archivos `*.test.tsx` dedicados a su vista aislada.
   - *Dónde se prueba:* Su montaje y resolución de navegación están garantizados por la suite general de rutas `apps/web/src/site/routes.test.tsx` y la suite de integración de la aplicación `tests/unit/render/App.test.tsx`.
