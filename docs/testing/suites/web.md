# Catálogo de Suites de Pruebas: Frontend Web

[⬅️ Volver a Suites de Pruebas](README.md) | [Siguiente: Suites del Parser ➡️](parser.md)

---

## 1. Resumen Ejecutivo

Censo medido el 6 de octubre de 2026 con `vitest run --reporter=json` y `wc -l` (líneas brutas). El frontend (`apps/web`) tiene **28 suites co-ubicadas con 168 pruebas** (2.962 LoC brutas), todas en verde en esa medición. Las cifras cambian con cada PR que añade pruebas; la forma de volver a medirlas está en el [índice de suites](README.md#5-cómo-actualizar-este-censo).

Las pruebas se ejecutan bajo Vitest en el entorno `node`, sin JSDOM: los componentes se renderizan a HTML con `react-dom/server` y `window`, `document` o `fetch` se sustituyen por dobles cuando hacen falta. Validan la separación del Golden Standard: componentes visuales puros (*Dumb UI*), *headless hooks*, reducers de estado puro, clientes de API y servicios de activos de Riot Games (DataDragon y CommunityDragon).

---

## 2. Inventario de Suites de `apps/web`

| # | Archivo de Prueba | Pruebas | LoC brutas | Área / Característica | Alcance y Aserciones Principales |
|---|---|---:|---:|---|---|
| 1 | `apps/web/src/features/competition/api/competition-detail-api.test.ts` | 5 | 56 | API Competición | Cliente de red para detalles de equipos y jugadores, paso de señales de cancelación (`AbortSignal`) y manejo de respuestas JSON tipadas. |
| 2 | `apps/web/src/features/competition/components/MatchCard.test.tsx` | 5 | 65 | Tarjeta de Partido | Enlace a la grabación o a la emisión en directo según el estado del partido y fecha y hora en `Europe/Madrid` aunque el proceso use otra zona horaria. |
| 3 | `apps/web/src/features/crud-operations/api/crud-delete-api.test.ts` | 3 | 73 | API CRUD Delete | Solicitud de previsualización de dependencias de borrado en cascada, validación de tokens de sesión y captura de errores HTTP 409 Conflict. |
| 4 | `apps/web/src/features/crud-operations/components/CrudDeleteDialog.test.tsx` | 4 | 97 | Componente CRUD | Renderizado accesible de diálogo modal de confirmación, listado de entidades bloqueantes asociadas y emisión de callback `onConfirm`. |
| 5 | `apps/web/src/features/database-transfer/components/DatabaseTransferPanel.test.tsx` | 3 | 55 | Componente DB Transfer | Controles de interfaz para exportación e importación de volcados `.dump`, estados visuales de progreso y bloqueo de botones durante la transferencia. |
| 6 | `apps/web/src/features/discord-bridge/api/bridge-api.test.ts` | 7 | 136 | API Discord Bridge | Consultas de salud del puente (`/api/v1/bridge/health`), sincronización manual y manejo de respuestas de error. |
| 7 | `apps/web/src/features/discord-bridge/hooks/useBridgeHealth.test.ts` | 5 | 116 | Hook Discord Bridge | Hook reactivo que sondea el estado de conexión del bot de Discord aplicando retroceso exponencial (*exponential backoff*) y reintentos ante desconexión. |
| 8 | `apps/web/src/features/home-content/components/ArticleView.test.tsx` | 3 | 61 | Componente Noticias | Vista de lectura de artículos: imágenes subidas entre párrafos con su descripción, HTML y URLs de imagen no admitidas tratados como texto, y fecha de publicación en `Europe/Madrid`. |
| 9 | `apps/web/src/features/home-content/pending-images.test.ts` | 4 | 59 | Imágenes Pendientes | Limpieza de imágenes subidas en el editor al descartar, conservación tras guardar, reintento tras un guardado fallido y reinicio en modo estricto de React. |
| 10 | `apps/web/src/features/home-content/useEditorLeaveGuard.test.ts` | 3 | 35 | Guarda del Editor | Confirmación al abandonar un editor con cambios, salida sin aviso si no los hay, bloqueo de la navegación interna durante una escritura y aviso al recargar o cerrar solo con cambios o subidas pendientes. |
| 11 | `apps/web/src/features/predictions/selectable-rounds.test.tsx` | 2 | 36 | Filtro de Jornadas | Restricción temporal de jornadas seleccionables (solo jornada actual y anteriores, orden cronológico de la más antigua a la actual, nunca futuras). |
| 12 | `apps/web/src/features/predictions/usePredictions.test.ts` | 1 | 8 | Hook Predicciones | Construcción determinista de la ruta del recurso con parámetro `roundId` condicional en `predictionsOverviewPath`. |
| 13 | `apps/web/src/features/suggestions/api/suggestions-api.test.ts` | 12 | 216 | API Sugerencias | Cliente HTTP para el envío de propuestas y la consulta de su estado: 202, mensajes de error de la API, espera según `Retry-After` en 429 y servicio no disponible en 503. |
| 14 | `apps/web/src/features/suggestions/components/SuggestionForm.test.tsx` | 9 | 124 | Formulario Sugerencias | Validación en tiempo real del límite de caracteres, deshabilitación de envío con campos vacíos y visualización de mensajes de error accesibles. |
| 15 | `apps/web/src/features/suggestions/components/SuggestionModal.test.tsx` | 4 | 49 | Modal Sugerencias | Contenedor de diálogo accesible (tecla Escape, foco atrapado, aria-modal) que encapsula el formulario de propuestas. |
| 16 | `apps/web/src/features/suggestions/hooks/useSuggestion.test.ts` | 4 | 114 | Hook Sugerencias | Headless hook que coordina el ciclo de vida asíncrono de una propuesta (`idle -> submitting -> queued -> confirmed`), aislando la lógica de red de los componentes visuales. |
| 17 | `apps/web/src/features/suggestions/m4-modal-layout-stress.test.tsx` | 20 | 579 | Estrés de Layout | Batería intensiva de pruebas de estrés para el modal en diversos viewports (móvil, tablet, escritorio amplio), comprobando que textos extensos no causen desbordamiento visual (*overflow*). |
| 18 | `apps/web/src/features/suggestions/state/suggestion-reducer.test.ts` | 13 | 228 | Reducer Sugerencias | Función reductora pura de la máquina de estados de propuestas: transiciones deterministas, inmutabilidad del estado y reinicio a valores iniciales. |
| 19 | `apps/web/src/shared/browser-navigation.test.ts` | 3 | 83 | Navegación del Navegador | Enlaces cancelados sin entradas de historial nuevas, Atrás/Adelante cancelados que restauran la entrada original y enlaces a la misma página sin aviso ni remontaje del editor. |
| 20 | `apps/web/src/shared/display-name.test.ts` | 2 | 12 | Utilidad Nombres | Sanitización y formateo de nombres de usuario en Discord, soporte de caracteres unicode, emojis y fuentes decorativas. |
| 21 | `apps/web/src/shared/league-time.test.ts` | 3 | 32 | Hora de la Liga | `formatLeagueDate`: instante cercano a medianoche, cambio de horario de invierno y fecha no válida, con independencia de la zona horaria del proceso. |
| 22 | `apps/web/src/shared/riot/community-dragon.service.test.tsx` | 20 | 68 | Servicio CommunityDragon | Resolución de URLs de iconos de posiciones de juego (top, jungle, mid, adc, support), mapeo de nombres abreviados y URLs de respaldo (*fallbacks*). |
| 23 | `apps/web/src/shared/riot/data-dragon.service.test.ts` | 6 | 137 | Servicio Data Dragon | Consulta de versión activa de parches de League of Legends, obtención y caché en memoria de catálogos de campeones, objetos y runas reforzadas. |
| 24 | `apps/web/src/site/layout/SiteLayout.test.tsx` | 1 | 21 | Layout General | Montaje del caparazón estructural de la aplicación: barra de navegación superior, contenedor principal de vista y pie de página. |
| 25 | `apps/web/src/site/pages/champions/ChampionsTable.test.tsx` | 3 | 56 | Página Campeones | Tabla de estadísticas de campeones de la liga: ordenación por columnas (partidas, victorias, KDA), filtrado y estado vacío. |
| 26 | `apps/web/src/site/pages/players/PlayersPage.test.tsx` | 5 | 197 | Página Jugadores | Ordenación numérica por estadística con los valores ausentes al final, jugadores sin rol activo en la vista general, estadísticas destacadas sin puntuaciones internas de MVP y escudo del jugador destacado. |
| 27 | `apps/web/src/site/pages/predictions/PredictionCard.test.tsx` | 15 | 212 | Tarjeta Predicciones | Votación en series Bo1/Bo3/Bo5 con porcentajes ocultos hasta el cierre, participantes inactivos (6 identificadores de rol) sin votación, ranking de predictores (top 5 más la fila propia identificada por texto, avatares por el proxy e iniciales), placeholder sin anuncio redundante y hora del partido en `Europe/Madrid`. |
| 28 | `apps/web/src/site/routes.test.tsx` | 3 | 37 | Enrutamiento Global | Resolución del mapa de rutas (`/`, `/competition`, `/teams`, `/players`, `/predictions` con recursos `['calendar', 'rounds']`, `/admin`), parámetros dinámicos de URL, ruta 404 y ausencia de secciones retiradas (`/fantasy`). |

---

## 3. Estrategia de Cobertura Frontend Externa

1. **Funcionalidad `auth` (`apps/web/src/features/auth/`):**
   - *Ausencia en carpeta local:* Cero archivos `*.test.tsx` directos dentro de `features/auth/`.
   - *Dónde se prueba:* En `tests/unit/render/AuthControls.test.tsx` (11 pruebas, 115 LoC brutas), que valida el enlace de inicio de sesión de Discord, el avatar del usuario autenticado servido por el proxy propio, las iniciales de respaldo y el cierre de sesión; el cliente HTTP de sesión se prueba en `tests/unit/auth-api.test.ts` (11 pruebas, 72 LoC brutas).
2. **Funcionalidad `rofl-upload` (`apps/web/src/features/rofl-upload/`):**
   - *Ausencia en carpeta local:* Cero archivos `*.test.tsx` directos dentro de `features/rofl-upload/`.
   - *Dónde se prueba:* En `tests/unit/useRoflUploadWs.test.ts` (16 pruebas, 255 LoC brutas) para toda la orquestación del hook de streaming binario y en `tests/unit/render/rofl-upload.test.tsx` (7 pruebas, 127 LoC brutas) para la interfaz de arrastrar y soltar repeticiones.
3. **Página `crystal-ball` (`/bola-cristal`):**
   - *Ausencia de pruebas dedicadas:* No cuenta con un archivo `*.test.tsx` dedicado a su vista aislada.
   - *Dónde se prueba:* Su montaje y resolución de navegación están garantizados por la suite general de rutas `apps/web/src/site/routes.test.tsx` y la suite de integración de la aplicación `tests/unit/render/App.test.tsx`.
4. **Fechas y horas en la zona horaria de la liga:**
   - `apps/web/src/shared/league-time.test.ts` (3 pruebas) cubre `formatLeagueDate`: instante cercano a medianoche, cambio de horario de invierno y fecha no válida.
   - `MatchCard.test.tsx`, `PredictionCard.test.tsx` y `ArticleView.test.tsx` renderizan `2026-10-04T22:30:00Z` y comprueban la fecha y hora de `Europe/Madrid` (`05 oct` / `00:30`, `lun, 00:30`, `5 de octubre de 2026`).
   - Estas suites fijan `process.env.TZ = 'America/New_York'` en `beforeAll` y lo restauran (o lo eliminan si no existía) en `afterAll`, de modo que detectan un formateo con la zona del proceso aunque la máquina esté en horario peninsular.
