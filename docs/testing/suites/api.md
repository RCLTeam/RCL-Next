# Catálogo de Suites de Pruebas: Backend API

[⬅️ Volver a Suites de Pruebas](README.md) | [Siguiente: Suites Frontend ➡️](web.md)

---

## 1. Resumen Ejecutivo

Censo medido el 6 de octubre de 2026 con `vitest run --reporter=json` y `wc -l` (líneas brutas, incluidas las vacías y los comentarios). El backend (`apps/api`) tiene **23 suites co-ubicadas con 268 pruebas** (5.358 LoC brutas) y `packages/contracts` añade **1 suite con 3 pruebas** (28 LoC brutas). Todas pasaron en esa medición. Las cifras cambian con cada PR que añade pruebas; la forma de volver a medirlas está en el [índice de suites](README.md#5-cómo-actualizar-este-censo).

Estas pruebas se ejecutan bajo Vitest en el entorno `node` y validan lógica pura, configuración, clientes remotos con respuestas simuladas y routers Express sin servidor real. Algunas usan PGlite (por ejemplo `sitemap.repository.test.ts`).

---

## 2. Inventario de Suites de `apps/api` y `packages/contracts`

| # | Archivo de Prueba | Pruebas | LoC brutas | Módulo / Subsistema | Alcance y Aserciones Principales |
|---|---|---:|---:|---|---|
| 1 | `apps/api/src/config/auth-env.test.ts` | 4 | 51 | Configuración Auth | Validación de variables OAuth de Discord (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`), obligatoriedad de protocolo HTTPS en producción y parsing de valores por defecto. |
| 2 | `apps/api/src/config/env.test.ts` | 20 | 214 | Entorno Global | Función `parseEnvironment`, validación de formato de cadena de conexión `DATABASE_URL`, cotas numéricas del puerto HTTP `PORT` (1-65535), entorno `NODE_ENV`, `TRUST_PROXY`, validación de `DISCORD_BOT_WS_URL` y `CORS_ORIGIN` sin credenciales de Discord, rutas y `FRONTEND_URL`, y aceptación del conjunto de variables del despliegue de producción con valores ficticios. |
| 3 | `apps/api/src/config/load-env.test.ts` | 6 | 86 | Carga de Entorno | `loadEnvironment` sobre `process.env` con `dotenv` simulado (no lee el `.env` del desarrollador): valores por defecto (`PORT` 3001, `HOST`, `CORS_ORIGIN`), `NODE_ENV` por defecto, `PORT` y `NODE_ENV` personalizados y errores con `DATABASE_URL` ausente o no PostgreSQL o con `PORT` inválido. |
| 4 | `apps/api/src/modules/auth/discord-avatars.router.test.ts` | 19 | 168 | Proxy de Avatares | Proxy de avatares de Discord: bytes y cabeceras sin reenviar cookies, avatares animados, identificadores inválidos, caché con caducidad de una hora y expulsión por cantidad y memoria, descargas concurrentes compartidas, errores remotos, cuerpos vacíos o de tamaño incorrecto y cancelación por tamaño real. Detalle en [discord-avatars.md](../discord-avatars.md). |
| 5 | `apps/api/src/modules/auth/discord.client.test.ts` | 4 | 40 | Autenticación OAuth | Sanitización de errores remotos de la API de Discord mediante `it.each`: fallos de red (`network`), token inválido (`bad-token`), error de perfil (`profile-error`) y payload malformado (`bad-profile`). |
| 6 | `apps/api/src/modules/auth/session-cookie.test.ts` | 12 | 32 | Cookie de Sesión | Lector único de la cookie (`session-cookie.ts`): nombre según `secureCookies` (`__Host-rcl_session` o `rcl_session`), cookie entre otras, valor vacío, nombres parecidos y rechazo de cookies duplicadas. |
| 7 | `apps/api/src/modules/competition/champion-stats.test.ts` | 2 | 39 | Motor de Competición | Agregación de estadísticas de campeones sobre partidas completadas: cálculo de tasa de elección (*pick rate*), porcentaje de victorias (*win rate*) y ordenación descendente. |
| 8 | `apps/api/src/modules/competition/competition.service.test.ts` | 1 | 116 | Servicio de Competición | La ficha de equipo carga las partidas de todos sus encuentros completados con una sola consulta. |
| 9 | `apps/api/src/modules/competition/player-statistics.test.ts` | 8 | 202 | Estadísticas de Jugador | Algoritmos de cálculo de KDA ratio, súbditos por minuto (CS/min), participación en bajas (KP%), puntuación de visión, daño relativo y fórmula ponderada de MVP automático. |
| 10 | `apps/api/src/modules/database-transfer/postgres-backup-tools.test.ts` | 1 | 41 | Transferencia de Base de Datos | Argumentos de `pg_dump`: exporta los esquemas `public` y `drizzle` sin las filas de `auth_sessions` ni `oauth_states`. |
| 11 | `apps/api/src/modules/database-transfer/postgres-copy-backup.test.ts` | 8 | 40 | Transferencia de Base de Datos | Parser de los bloques `COPY` que emite `pg_restore`: descarte de sentencias que no son `COPY`, escape de delimitadores tabulares, caracteres nulos (`\N`) y tablas opcionales. |
| 12 | `apps/api/src/modules/discord-bridge/discord-bridge.client.test.ts` | 30 | 912 | Puente con Bot Discord | Cliente WebSocket del bot: sonda de salud efímera (compartida entre peticiones concurrentes y cacheada `healthCacheMs`), cola secuencial, pausa ante `RATE_LIMITED` y límite acumulado de 5 minutos, cierre por inactividad y reconexión perezosa, enrutado por opcode, fallos de conexión sin rechazos no gestionados, URL vacía y capacidad de la cola, y respuestas del router de salud (200/503, `Cache-Control: no-store`). |
| 13 | `apps/api/src/modules/page-metadata/page-metadata.test.ts` | 11 | 360 | Metadatos de Página | Metadatos de fichas y páginas fijas, HTML inicial sin JavaScript, 404 para rutas y fichas inexistentes, consultas ligeras por recurso, caché con TTL y *single-flight*, errores no cacheados, partidos solo completados o por incomparecencia y límite de entradas de la caché. |
| 14 | `apps/api/src/modules/predictions/prediction-policy.test.ts` | 8 | 108 | Políticas de Predicciones | Semanas que empiezan el lunes a medianoche en `Europe/Madrid` (con cambio de horario), votación abierta hasta una hora antes de cada partido, solo partidos programados de la semana, puntuación (3 puntos por marcador exacto, 1 por ganador, sin bonus de racha) y jornada actual. |
| 15 | `apps/api/src/modules/rofl-upload/rofl-upload.test.ts` | 15 | 634 | Subida de Repeticiones | Validación de lotes ZIP, correspondencia de participantes con cuentas de invocador en base de datos, detección de anomalías multi-cuenta y avance correlativo de números de partida en series. |
| 16 | `apps/api/src/modules/sitemap/persistence/sitemap.repository.test.ts` | 12 | 336 | Sitemap: Persistencia | `PostgresSitemapRepository` con base simulada y con PGlite: equipos con temporada, división y estado; jugadores; solo artículos publicados; `createdAt` como respaldo de `updatedAt` y propagación de errores. |
| 17 | `apps/api/src/modules/sitemap/processing/sitemap-builder.test.ts` | 17 | 147 | Sitemap: XML | `escapeXml`, `formatSitemapDate` (UTC, `RangeError` con fechas inválidas) y `buildSitemapXml`: campos opcionales, prioridad con un decimal acotada a [0, 1] y orden de las entradas. |
| 18 | `apps/api/src/modules/sitemap/processing/sitemap.service.test.ts` | 18 | 461 | Sitemap: Servicio | Rutas estáticas derivadas de `pageMetadata` sin el área de administración, rutas dinámicas con los mismos slugs que la API de competición, URL base (`baseUrl` o dominio por defecto), caché con TTL de 1 hora, deduplicación de peticiones concurrentes, invalidación y reintento tras un error. |
| 19 | `apps/api/src/modules/suggestions/incident-logger.test.ts` | 6 | 69 | Logger de Incidentes | Formato estandarizado de incidentes en producción, generación de UUID v4 para trazabilidad, escritura en stream de errores (`stderr`) y anonimización de datos sensibles. |
| 20 | `apps/api/src/modules/suggestions/suggestion.store.test.ts` | 10 | 205 | Almacén de Sugerencias | Máquina de estados en memoria para propuestas de usuarios, poda automática por tiempo de vida (TTL de 2 horas), transiciones entre estados (`queued -> sending -> retrying -> confirmed/failed`) sin retroceso desde un estado terminal y capacidad máxima (`maxRecords`). |
| 21 | `apps/api/src/modules/suggestions/suggestions.integration.test.ts` | 7 | 179 | Integración Sugerencias | Aplicación completa: salud del puente (200/503), CORS con `Retry-After` expuesto, ciclo 202 → consulta → confirmada, fallo por límite de tasa con `incidentId`, barrera CSRF sin `Origin` y 404 en rutas desconocidas. |
| 22 | `apps/api/src/modules/suggestions/suggestions.router.test.ts` | 22 | 390 | Enrutador HTTP Sugerencias | Códigos de respuesta del endpoint Express: 202 Accepted, 403 por origen ausente o ajeno, 400 por texto inválido, usuario resuelto por la cookie de sesión (7 casos parametrizados de selección de cookie en HTTP y HTTPS), 404 de estado desconocido, 429 con `Retry-After` y 503 con almacén lleno o puente sin URL. |
| 23 | `apps/api/src/modules/suggestions/suggestions.service.test.ts` | 27 | 528 | Lógica de Sugerencias | Límites de texto, resolución del autor (anónimo o identificado), eventos del puente y estados (`sending`, `processing`, `retrying`, `confirmed`, `failed`), detalles técnicos fuera del estado público, 503 sin puente configurado o con la cola o el almacén llenos, y límites de envío distintos para anónimos y usuarios identificados. |
| 24 | `packages/contracts/src/page-metadata.test.ts` | 3 | 28 | Contratos: Metadatos | Descripciones distintas por sección pública con normalización de consulta y barra final, secciones retiradas sin metadatos y escape de atributos al reemplazar las etiquetas del HTML. |

---

## 3. Estrategia de Cobertura para Módulos sin Pruebas Unitarias Co-ubicadas

Conforme al diseño de la infraestructura de pruebas del monorepo, se señala explícitamente qué partes del código no cuentan con archivos de prueba directos en su carpeta local y por qué:

1. **Módulo `crud-operations` (`apps/api/src/modules/crud-operations/`):**
   - *Ausencia:* Cero archivos `*.test.ts` en el directorio.
   - *Dónde se prueba:* Se prueba de forma exhaustiva en `tests/integration/crud-operations.test.ts` (23 pruebas, 937 LoC brutas).
   - *Justificación:* El motor de borrado relacional e introspección de claves foráneas no puede verificarse de forma significativa mediante mocks unitarios; requiere validar que PostgreSQL bloquee o propague borrados contra el motor relacional real en PGlite.

2. **Módulo `home-content` (`apps/api/src/modules/home-content/`):**
   - *Ausencia:* Cero archivos `*.test.ts` en el directorio.
   - *Dónde se prueba:* En `tests/integration/home-content.test.ts` (9 pruebas, 572 LoC brutas).
   - *Justificación:* La persistencia de artículos y quintetos ideales requiere transacciones reales y verificación de ordenación cronológica en la base de datos.

3. **Módulo `member-roles` (`apps/api/src/modules/member-roles/`):**
   - *Ausencia:* Cero archivos `*.test.ts` en el directorio.
   - *Dónde se prueba:* En `tests/integration/member-roles.test.ts` (6 pruebas, 169 LoC brutas).
   - *Justificación:* Valida las restricciones relacionales sobre los roles del sistema (`appRole`: `'viewer'`, `'admin'`, `'owner'`) en la tabla `discord_users`.

4. **Módulo `team-logos` (`apps/api/src/modules/team-logos/`):**
   - *Ausencia:* Cero archivos `*.test.ts` en el directorio.
   - *Dónde se prueba:* En `tests/integration/crud-operations.test.ts` (subida de un logo, asignación desde el CRUD y servicio público) y `tests/integration/home-content.test.ts` (escrituras autenticadas, comprobación de origen y nombres de archivo seguros).
   - *Justificación:* El almacén escribe en disco y el router depende de la sesión de administrador; se prueba a través de la aplicación completa.
