# Catálogo de Suites de Pruebas: Integración y Renderizado Transversal

[⬅️ Volver a Suites de Pruebas](README.md)

Las suites `tests/integration/api.test.ts` y `tests/unit/render/AuthControls.test.tsx` incorporan la integración y el renderizado del [proxy de avatares](../discord-avatars.md). Los recuentos históricos siguientes preceden a esta ampliación.

---

## 1. Resumen Ejecutivo

El corazón de la verificación de robustez de RCL-Next reside en las suites de integración relacional (`tests/integration/`, **26 archivos, 531 pruebas, 11.890 líneas de código**) y en las suites de renderizado y lógica transversal (`tests/unit/`, **15 archivos, 102 pruebas, 1.679 líneas de código**).

En conjunto, este estrato agrupa **633 pruebas automatizadas** que certifican el comportamiento de extremo a extremo de la plataforma: transacciones atómicas contra PostgreSQL en memoria (PGlite), pasarelas WebSocket en tiempo real, autenticación federada con Discord, mitigación de ataques adversarios y verificación de interfaces de usuario desacopladas.

---

## 2. Suites de Integración Relacional (`tests/integration/`)

Todas las suites de este directorio interactúan con instancias efímeras de **PGlite** (`@electric-sql/pglite`), garantizando el aislamiento transaccional y la reproducibilidad total de los escenarios:

| # | Archivo de Prueba | Pruebas | Líneas (LoC) | Dominio Funcional | Foco de Verificación y Comportamiento Crítico |
|---|---|---:|---:|---|---|
| 1 | `tests/integration/adversarial-rofl-upload.test.ts` | 4 | 91 | Seguridad ROFL | Inyección de archivos hostiles: cabeceras mágicas falsas, payloads que superan la cota máxima y fragmentos corruptos durante la subida. |
| 2 | `tests/integration/api-database.test.ts` | 1 | 351 | E2E API-DB | Flujo completo desde petición HTTP externa hasta inserción, consulta y transformación de entidades sobre las 21 tablas relacionales. |
| 3 | `tests/integration/api.test.ts` | 9 | 267 | Rutas REST | Rutas públicas del backend: salud del servicio (`/health`), catálogos de temporadas, divisiones y equipos sobre la base de datos real. |
| 4 | `tests/integration/auth-adversarial.test.ts` | 26 | 300 | Seguridad Auth | Batería adversaria contra el flujo OAuth: cookies de sesión manipuladas, firmas criptográficas inválidas, estados OAuth caducados y suplantación de identidad. |
| 5 | `tests/integration/auth-websocket-adversarial.test.ts` | 13 | 383 | Seguridad WS | Intentos de conexión WebSocket sin cabecera de autenticación, secuestro de sesiones (*session hijacking*) y emisión de mensajes antes de completar el handshake. |
| 6 | `tests/integration/auth.test.ts` | 12 | 320 | Flujo Auth | Intercambio completo de código OAuth2 de Discord, persistencia de usuarios en `discord_users`, creación de sesión y endpoint `/api/v1/auth/me`. |
| 7 | `tests/integration/crud-operations.test.ts` | 20 | 763 | Motor CRUD | Bloqueo preventivo de borrados relacionales con claves foráneas dependientes, previsualización de impacto, mutaciones atómicas y registro en `audit_logs`. |
| 8 | `tests/integration/database-transfer.test.ts` | 8 | 237 | Transferencia DB | Generación de volcados de base de datos (`COPY`), streaming de descarga, registro de cada exportación en `audit_logs`, volcados sin filas de sesiones y validación previa antes de restauración. |
| 9 | `tests/integration/database.test.ts` | 1 | 361 | Integridad DB | Migración idempotente del esquema consolidado, verificación de tipos nativos `bigint` para IDs de Discord y consistencia de tablas Drizzle. |
| 10 | `tests/integration/demo-showcase.test.ts` | 1 | 60 | Fixtures Semilla | Ejecución idempotente y repetida de las siembras `demo.sql` y `showcase.sql` comprobando la ausencia de errores de clave duplicada. |
| 11 | `tests/integration/discord-client.test.ts` | 4 | 40 | Cliente Discord | Manejo de caídas de red, latencias y respuestas anómalas del proveedor de identidad de Discord. |
| 12 | `tests/integration/home-content.test.ts` | 6 | 453 | Contenido Editorial | Publicación de artículos de noticias y persistencia del quinteto ideal de la jornada con aislamiento transaccional. |
| 13 | `tests/integration/member-roles.test.ts` | 6 | 169 | Roles de Sistema | Mutación y auditoría de privilegios administrativos (`viewer`, `admin`, `owner`), previniendo la degradación del último propietario. |
| 14 | `tests/integration/predictions-router.test.ts` | 1 | 42 | Rutas Predicciones | Validación estricta de `roundId` (formato, límites int16, unicidad y rechazo de parámetros extra) y reenvío al repositorio en `overview`. |
| 15 | `tests/integration/predictions.test.ts` | 2 | 233 | Predicciones | Filtrado por jornada (`id_round`), jornada por defecto (`currentRoundId`), error 404 cuando la jornada no pertenece a la división, persistencia de pronósticos, bloqueo tras el inicio y cálculo de clasificación. |
| 16 | `tests/integration/rofl-concurrency-adversarial.test.ts` | 3 | 382 | Concurrencia ROFL | Estrés de subidas simultáneas: bloqueo pesimista `SELECT ... FOR UPDATE` en matches para evitar colisión de partidas en series Bo3/Bo5. |
| 17 | `tests/integration/rofl-parser-timeout-adversarial.test.ts` | 4 | 107 | Tiempos de Espera | Límites estrictos de ejecución de subprocesos Python (45s), terminación forzada con `SIGKILL` y erradicación de procesos zombi. |
| 18 | `tests/integration/rofl-stats.test.ts` | 1 | 191 | Métricas ROFL | Verificación cruzada entre las estadísticas calculadas tras la ingesta de una repetición y los registros persistidos en las 5 tablas Drizzle. |
| 19 | `tests/integration/rofl-streaming-quota-adversarial.test.ts` | 2 | 154 | Cuotas de Subida | Transmisión de archivos que exceden la cuota permitida de 50 MB, cierre del socket con código 1009 (*Message Too Big*) y limpieza de temporales. |
| 20 | `tests/integration/rofl-upload-repository.test.ts` | 1 | 350 | Repositorio ROFL | Inserción atómica en `match_games`, `player_game_info`, `player_game_stats`, `player_game_runes` y `player_game_build` con trigger diferido `complete_player_game`. |
| 21 | `tests/integration/rofl-upload-websocket.test.ts` | 10 | 710 | WebSocket Gateway | Ciclo de vida del canal de subida `/ws/rofl-upload`, señalización de progreso, contrapresión de lectura de chunks binarios y desconexión limpia; rechazo del handshake con `Origin` ajeno o ausente (403) y sin autenticación configurada (503), y errores inesperados de persistencia ocultos tras un `incidentId`. |
| 22 | `tests/integration/rofl-websocket-end-to-end.test.ts` | 4 | 528 | E2E ROFL | Pipeline integral: subida WebSocket de `.rofl` real $\rightarrow$ spooling en disco $\rightarrow$ parser Python $\rightarrow$ persistencia relacional $\rightarrow$ consulta vía API REST. |
| 23 | `tests/integration/schema-constraints.test.ts` | 1 | 260 | Restricciones SQL | Restricciones `CHECK`, índices únicos parciales y comprobaciones de integridad deportiva en la base de datos. |
| 24 | `tests/integration/suggestions-opaque-e2e.test.ts` | 345 | 3.990 | Fuzzing Sugerencias | **La suite más grande del monorepo**: 345 pruebas basadas en propiedades y fuzzing que exploran todas las transiciones de estado, TTL, concurrencia y límites del buzón de sugerencias. |
| 25 | `tests/integration/tier5-adversarial-challenger.test.ts` | 45 | 892 | Auditoría Adversaria | Batería forense de 45 pruebas sobre casos de borde, inyección de caracteres nulos, URLs de gran longitud y desbordamientos en todas las rutas de la API. |
| 26 | `tests/integration/tier5-chaos-concurrency.test.ts` | 7 | 518 | Ingeniería del Caos | Interrupción abrupta de conexiones en mitad de operaciones transaccionales, desconexión de red simulada y recuperación determinista del servidor. |

---

## 3. Suites de Renderizado y Shell de Aplicación (`tests/unit/`)

Este directorio contiene pruebas unitarias que no están co-ubicadas en las carpetas de módulos de `apps/` y pruebas de renderizado visual de React 19:

| # | Archivo de Prueba | Pruebas | Líneas (LoC) | Tipo / Componente | Foco de Verificación |
|---|---|---:|---:|---|---|
| 27 | `tests/unit/auth-api.test.ts` | 11 | 72 | Mocked API | Pruebas unitarias sobre los controladores de autenticación y middleware de autorización. |
| 28 | `tests/unit/competition-api.test.ts` | 3 | 44 | Mocked API | Controladores de clasificación y detalles de competición con respuestas simuladas. |
| 29 | `tests/unit/current-season.test.ts` | 4 | 32 | Utilidad Competición | Lógica de ordenación cronológica descendente de temporadas y selección de la temporada activa. |
| 30 | `tests/unit/profile-slugs.test.ts` | 4 | 51 | Formateo URLs | Generación y saneamiento de slugs URL para jugadores y equipos (eliminación de acentos, caracteres especiales y espacios). |
| 31 | `tests/unit/team-logos.test.ts` | 2 | 15 | Activos Visuales | Resolución de rutas de escudos de equipos y URLs de respaldo para logos ausentes. |
| 32 | `tests/unit/useRoflUploadWs.test.ts` | 13 | 222 | Hook Headless | Pruebas unitarias de la máquina de estados del hook `useRoflUploadWs`: progreso de subida, detección de anomalías y reconexión. |
| 33 | `tests/unit/render/AdminPage.test.tsx` | 11 | 132 | Renderizado UI | Vistas del panel de administración (`/admin`), control de pestañas, barreras de autorización y selección de herramientas. |
| 34 | `tests/unit/render/App.test.tsx` | 6 | 87 | Renderizado Shell | Montaje raíz de la aplicación web, resolución de rutas y renderizado de la página 404 ante rutas inexistentes. |
| 35 | `tests/unit/render/AuthControls.test.tsx` | 6 | 64 | Renderizado UI | Botón de inicio de sesión de Discord, avatar de usuario y menú de opciones de desconexión. |
| 36 | `tests/unit/render/DataState.test.tsx` | 8 | 83 | Renderizado UI | Componentes de estado de interfaz: spinner de carga, tarjetas de error accesibles y pantallas de estado vacío. |
| 37 | `tests/unit/render/SiteLayout.test.tsx` | 5 | 109 | Renderizado UI | Barra de navegación superior, contenedor de contenido y pie de página institucional. |
| 38 | `tests/unit/render/competition-pages.test.tsx` | 12 | 338 | Renderizado UI | Vistas de competición: calendarios de partidos, tablas de ligas, clasificaciones y eliminatorias de playoffs. |
| 39 | `tests/unit/render/match-detail.test.tsx` | 5 | 134 | Renderizado UI | Vista detallada de una partida: marcadores de equipo, runas reforzadas, desglose de objetos y estadísticas de daño. |
| 40 | `tests/unit/render/player-pages.test.tsx` | 6 | 199 | Renderizado UI | Perfiles individuales de jugadores: estadísticas por campeón, historial de partidas y porcentaje de participación. |
| 41 | `tests/unit/render/rofl-upload.test.tsx` | 6 | 97 | Renderizado UI | Zona de arrastrar y soltar repeticiones, barras de progreso y visor de incidencias. |
