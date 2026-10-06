# Catálogo de Suites de Pruebas: Integración y Renderizado Transversal

[⬅️ Volver a Suites de Pruebas](README.md)

---

## 1. Resumen Ejecutivo

Censo medido el 6 de octubre de 2026 con `vitest run --reporter=json` y `wc -l` (líneas brutas). Las suites de integración relacional (`tests/integration/`) suman **29 archivos, 573 pruebas y 13.589 LoC brutas**, y las de `tests/unit/` (clientes y hooks del frontend que no están co-ubicados y renderizado aislado en `render/`) **15 archivos, 125 pruebas y 1.929 LoC brutas**: **698 pruebas** en total, todas en verde en esa medición. Las cifras cambian con cada PR que añade pruebas; la forma de volver a medirlas está en el [índice de suites](README.md#5-cómo-actualizar-este-censo).

Este estrato verifica el comportamiento de extremo a extremo: transacciones contra PostgreSQL en memoria (PGlite), pasarelas WebSocket, autenticación con Discord, casos adversarios e interfaces de usuario desacopladas. La integración y el renderizado del [proxy de avatares](../discord-avatars.md) están en `tests/integration/api.test.ts` y `tests/unit/render/AuthControls.test.tsx`.

---

## 2. Suites de Integración Relacional (`tests/integration/`)

18 de las 29 suites crean instancias efímeras de **PGlite** (`@electric-sql/pglite`). Las otras 11 (`adversarial-rofl-upload`, `api`, `discord-client`, `predictions-router`, `rofl-parser-timeout-adversarial`, `rofl-streaming-quota-adversarial`, `sitemap-router`, `suggestions-bridge-unavailable`, `suggestions-opaque-e2e` y las dos `tier5-*`) montan la aplicación o el componente con repositorios, sockets o procesos simulados:

| # | Archivo de Prueba | Pruebas | LoC brutas | Dominio Funcional | Foco de Verificación y Comportamiento Crítico |
|---|---|---:|---:|---|---|
| 1 | `tests/integration/adversarial-rofl-upload.test.ts` | 4 | 91 | Seguridad ROFL | Inyección de archivos hostiles: cabeceras mágicas falsas, payloads que superan la cota máxima y fragmentos corruptos durante la subida. |
| 2 | `tests/integration/api-database.test.ts` | 1 | 391 | E2E API-DB | Flujo completo desde petición HTTP externa hasta inserción, consulta y transformación de entidades sobre las 21 tablas relacionales. |
| 3 | `tests/integration/api.test.ts` | 11 | 319 | Rutas REST | Aplicación completa (`createApp`) con repositorios en memoria: proxy de avatares sin cookies de Discord, salud con 503 si cae la base de datos, temporadas y divisiones, errores estables y sin detalles internos, reglas de clasificación (BO3, victorias de serie, diferencia de mapas), calendario por jornada y campeones distintos de la plantilla. |
| 4 | `tests/integration/auth-adversarial.test.ts` | 26 | 300 | Seguridad Auth | Validación adversaria del estado OAuth: longitudes distintas sin `RangeError`, cadenas vacías, Unicode y bytes nulos, estados y cookies de 10 MB, tipos no textuales, longitudes límite, hexadecimal en mayúsculas y reutilización de un estado consumido. |
| 5 | `tests/integration/auth-websocket-adversarial.test.ts` | 19 | 489 | Seguridad WS | Handshake del WebSocket de subida ROFL: cierre 4001 sin cookie o con cookie inválida, 4003 sin rol de administrador, revalidación del rol, posición de la cookie entre otras, 503 sin `authService` y selección de cookie con y sin `secureCookies` (prefijo `__Host-` y duplicadas). |
| 6 | `tests/integration/auth.test.ts` | 14 | 377 | Flujo Auth | Intercambio completo de código OAuth2 de Discord, estado ligado al navegador y guardado como hash, rechazo de estados repetidos o caducados, persistencia en `discord_users`, rotación y revocación de sesiones, flags de la cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` solo en HTTPS) y rechazo de cookies duplicadas o con el nombre equivocado en `/me`. |
| 7 | `tests/integration/crud-operations.test.ts` | 23 | 937 | Motor CRUD | CRUD con auditoría de cada entidad, sesiones de administrador y orígenes de confianza, paginación y búsqueda literal, ediciones y borrados obsoletos, reordenación atómica de mapas, logos asignados desde el CRUD, previsualización de borrados en cascada solo para el owner y bloqueo de referencias `RESTRICT`. |
| 8 | `tests/integration/database-transfer.test.ts` | 8 | 237 | Transferencia DB | Descarga del volcado como adjunto (`Content-Disposition`, `Cache-Control: no-store`) solo para administradores y owners con origen de confianza, registro de cada exportación en `audit_logs`, volcados sin filas de sesiones y validación previa antes de restauración. |
| 9 | `tests/integration/database.test.ts` | 1 | 343 | Integridad DB | Migración idempotente del esquema consolidado, verificación de tipos nativos `bigint` para IDs de Discord y consistencia de tablas Drizzle. |
| 10 | `tests/integration/demo-showcase.test.ts` | 1 | 64 | Fixtures Semilla | Ejecución idempotente y repetida de las siembras `demo.sql` y `showcase.sql` comprobando la ausencia de errores de clave duplicada. |
| 11 | `tests/integration/discord-client.test.ts` | 4 | 40 | Cliente Discord | Manejo de caídas de red, latencias y respuestas anómalas del proveedor de identidad de Discord. |
| 12 | `tests/integration/home-content.test.ts` | 9 | 572 | Contenido Editorial | Publicación de artículos e imágenes con autorización, limpieza de subidas abandonadas o huérfanas, gestión de logos de equipos, borradores privados, quinteto ideal por división y jornada y validación del contenido. |
| 13 | `tests/integration/member-roles.test.ts` | 6 | 169 | Roles de Sistema | Mutación y auditoría de privilegios administrativos (`viewer`, `admin`, `owner`), previniendo la degradación del último propietario. |
| 14 | `tests/integration/predictions-router.test.ts` | 1 | 42 | Rutas Predicciones | Validación estricta de `roundId` (formato, límites int16, unicidad y rechazo de parámetros extra) y reenvío al repositorio en `overview`. |
| 15 | `tests/integration/predictions.test.ts` | 3 | 354 | Predicciones | Filtrado por jornada (`id_round`), jornada por defecto (`currentRoundId`), error 404 cuando la jornada no pertenece a la división, persistencia de pronósticos, bloqueo tras el inicio, cálculo de clasificación y agregación SQL del ranking de temporada y de los porcentajes (varios usuarios, marcadores exactos, votos sin marcador, empates y filas leídas independientes del número de votos). |
| 16 | `tests/integration/rofl-concurrency-adversarial.test.ts` | 3 | 386 | Concurrencia ROFL | Estrés de subidas simultáneas: bloqueo pesimista `SELECT ... FOR UPDATE` en matches para evitar colisión de partidas en series Bo3/Bo5. |
| 17 | `tests/integration/rofl-parser-timeout-adversarial.test.ts` | 4 | 107 | Tiempos de Espera | Límites estrictos de ejecución de subprocesos Python (45s), terminación forzada con `SIGKILL` y erradicación de procesos zombi. |
| 18 | `tests/integration/rofl-stats.test.ts` | 1 | 189 | Métricas ROFL | Verificación cruzada entre las estadísticas calculadas tras la ingesta de una repetición y los registros persistidos en las 5 tablas Drizzle. |
| 19 | `tests/integration/rofl-streaming-quota-adversarial.test.ts` | 2 | 154 | Cuotas de Subida | Transmisión de archivos que exceden la cuota permitida de 50 MB, cierre del socket con código 1009 (*Message Too Big*) y limpieza de temporales. |
| 20 | `tests/integration/rofl-upload-repository.test.ts` | 5 | 579 | Repositorio ROFL | Inserción atómica en `match_games`, `player_game_info`, `player_game_stats`, `player_game_runes` y `player_game_build` con trigger diferido `complete_player_game`, orden de mapas importados y duplicados en subidas simultáneas (`skippedDuplicates`). |
| 21 | `tests/integration/rofl-upload-websocket.test.ts` | 10 | 709 | WebSocket Gateway | Ciclo de vida del canal de subida `/ws/rofl-upload`, señalización de progreso, contrapresión de lectura de chunks binarios y desconexión limpia; rechazo del handshake con `Origin` ajeno o ausente (403) y sin autenticación configurada (503), y errores inesperados de persistencia ocultos tras un `incidentId`. |
| 22 | `tests/integration/rofl-websocket-end-to-end.test.ts` | 4 | 520 | E2E ROFL | Pipeline integral: subida WebSocket del `.rofl` de prueba anonimizado $\rightarrow$ spooling en disco $\rightarrow$ parser Python $\rightarrow$ persistencia relacional $\rightarrow$ consulta vía API REST. |
| 23 | `tests/integration/schema-constraints.test.ts` | 1 | 243 | Restricciones SQL | Restricciones `CHECK`, índices únicos parciales y comprobaciones de integridad deportiva en la base de datos. |
| 24 | `tests/integration/sitemap-database.test.ts` | 4 | 214 | Sitemap con BD | Slugs de equipos y jugadores iguales a los de la API de competición y reflejo en el siguiente `/sitemap.xml` de equipos creados o renombrados y artículos publicados; una escritura rechazada no invalida la caché. |
| 25 | `tests/integration/sitemap-router.test.ts` | 8 | 185 | Rutas Sitemap | `GET /api/sitemap.xml` y `/sitemap.xml`: XML con cabeceras de caché, URL base desde `frontendUrl`, errores delegados al middleware, 404 sin servicio configurado, sin ruta anidada y XML aunque la web se sirva desde la API y el cliente acepte HTML. |
| 26 | `tests/integration/suggestions-bridge-unavailable.test.ts` | 3 | 149 | Sugerencias sin Bot | Con el bot de Discord inaccesible, la sugerencia queda `failed` sin exponer detalles ni terminar el proceso; con URL vacía responde 503 `SUGGESTIONS_NOT_CONFIGURED` sin encolar, y una sonda de salud cuyo handshake no termina no bloquea el servicio. |
| 27 | `tests/integration/suggestions-opaque-e2e.test.ts` | 345 | 4.007 | Fuzzing Sugerencias | **La suite más grande del monorepo**: 345 pruebas basadas en propiedades y fuzzing que exploran todas las transiciones de estado, TTL, concurrencia y límites del buzón de sugerencias. |
| 28 | `tests/integration/tier5-adversarial-challenger.test.ts` | 45 | 899 | Auditoría Adversaria | Aislamiento de secretos del puente en la web y en las respuestas de salud, *fuzzing* de `Origin` (CSRF) y de longitud y caracteres del texto de sugerencias, entregas desordenadas o duplicadas en la máquina de estados y desacoplamiento entre el cliente del puente y el dominio de sugerencias. |
| 29 | `tests/integration/tier5-chaos-concurrency.test.ts` | 7 | 523 | Ingeniería del Caos | Interrupción abrupta de conexiones en mitad de operaciones transaccionales, desconexión de red simulada y recuperación determinista del servidor. |

---

## 3. Suites de Renderizado y Shell de Aplicación (`tests/unit/`)

Este directorio contiene pruebas unitarias que no están co-ubicadas en las carpetas de módulos de `apps/` y pruebas de renderizado visual de React 19:

| # | Archivo de Prueba | Pruebas | LoC brutas | Tipo / Componente | Foco de Verificación |
|---|---|---:|---:|---|---|
| 30 | `tests/unit/auth-api.test.ts` | 11 | 72 | Cliente Web | Cliente de sesión de la web (`features/auth/api/auth-api.ts`): roles persistidos aceptados y desconocidos rechazados, 401 como sesión anónima con cookies enviadas, 500 y 503 no tratados como sesión anónima, respuestas malformadas y cierre de sesión confirmado o fallido. |
| 31 | `tests/unit/competition-api.test.ts` | 3 | 44 | Cliente Web | Cliente de competición de la web (`features/competition/api/competition-api.ts`): sobre de respuesta y señal de cancelación, errores HTTP o respuestas malformadas que no se convierten en competiciones vacías y enlaces de emisión HTTP no locales rechazados. |
| 32 | `tests/unit/current-season.test.ts` | 4 | 32 | Utilidad Competición | Lógica de ordenación cronológica descendente de temporadas y selección de la temporada activa. |
| 33 | `tests/unit/profile-slugs.test.ts` | 4 | 51 | Formateo URLs | Generación y saneamiento de slugs URL para jugadores y equipos (eliminación de acentos, caracteres especiales y espacios). |
| 34 | `tests/unit/render/AdminPage.test.tsx` | 12 | 143 | Renderizado UI | Panel de administración (`/admin`): consolas montadas según el rol (logos, roles de miembros, subida de repeticiones), estados de sesión que no montan la consola, navegación de subpáginas, cierre de sesión pendiente y rechazo de roles desconocidos o sin proveedor de sesión. |
| 35 | `tests/unit/render/App.test.tsx` | 6 | 86 | Renderizado Shell | Montaje raíz de la aplicación web, resolución de rutas y renderizado de la página 404 ante rutas inexistentes. |
| 36 | `tests/unit/render/AuthControls.test.tsx` | 11 | 115 | Renderizado UI | Controles de Discord en la cabecera: avatares estáticos y animados por el proxy propio, iniciales sin avatar o tras un error de descarga, nombres normalizados, enlace de inicio de sesión, usuario y rol autenticados, cierre de sesión pendiente o fallido y reintento si la API no responde. |
| 37 | `tests/unit/render/DataState.test.tsx` | 8 | 83 | Renderizado UI | Componentes de estado de interfaz: spinner de carga, tarjetas de error accesibles y pantallas de estado vacío. |
| 38 | `tests/unit/render/SiteLayout.test.tsx` | 5 | 109 | Renderizado UI | Barra de navegación superior, contenedor de contenido y pie de página institucional. |
| 39 | `tests/unit/render/competition-pages.test.tsx` | 24 | 439 | Renderizado UI | Vistas de competición: plantillas de equipo, tarjetas de partido sin enlaces inseguros, playoffs, clasificaciones y su numeración, `DivisionCard`, visibilidad de equipos según el ID de rol de Discord (9 casos), equipos retirados en el calendario y cuadro de playoffs con datos incompletos. |
| 40 | `tests/unit/render/match-detail.test.tsx` | 5 | 134 | Renderizado UI | Vista detallada de una partida: marcadores de equipo, runas reforzadas, desglose de objetos y estadísticas de daño. |
| 41 | `tests/unit/render/player-pages.test.tsx` | 7 | 224 | Renderizado UI | Perfiles de jugadores: cuentas secundarias y principal, nombres normalizados, búsqueda por nombre y Riot ID, contexto de plantilla, enlaces directos con barra final, métricas de competición y enlaces desde la plantilla del equipo. |
| 42 | `tests/unit/render/rofl-upload.test.tsx` | 7 | 127 | Renderizado UI | Zona de arrastrar y soltar repeticiones, barras de progreso, visor de incidencias y ausencia de conexión WebSocket sin `wsUrl` ni `window.location`. |
| 43 | `tests/unit/team-logos.test.ts` | 2 | 15 | Activos Visuales | `resolveTeamLogo`: logos guardados (también rutas antiguas y públicas) servidos por la API gestionada, logos externos conservados y URLs inseguras rechazadas. |
| 44 | `tests/unit/useRoflUploadWs.test.ts` | 16 | 255 | Hook Headless | Pruebas unitarias de la máquina de estados del hook `useRoflUploadWs`: progreso de subida, detección de anomalías, reconexión y resolución de la URL del WebSocket. |
