# Procesamiento y Caché de Metadatos de Página

[⬅️ Volver a Rutas HTTP](routes.md) | [Volver al Índice de Metadatos de Página ⬆️](README.md)

---

## 1. Reconocimiento de fichas

**Archivo**: `page-metadata.service.ts:15, 37-54`

`PageMetadataService.resolve(path)` reconoce las fichas con `/^\/(equipos|jugadores|partidos|editorial)\/([^/]+)\/?$/`. Cualquier otra ruta devuelve directamente `getPageMetadata(path)`, sin consultas ni caché.

La referencia se decodifica con `decodeURIComponent`; si la codificación es inválida se devuelven los textos de página no encontrada (`page-metadata.service.ts:73-78`).

## 2. Consultas por tipo de ficha

Las fichas usan proyecciones de `CompetitionService` que resuelven la misma referencia (UUID o slug) que los endpoints de detalle, con los mismos directorios de slugs, pero sin calcular plantillas, estadísticas ni mapas:

| Ficha | Método | Llamadas al repositorio |
|---|---|---|
| `/equipos/:ref` | `teamSummary()` (`competition.service.ts:242-249`) | `teamDirectory()` (1) |
| `/jugadores/:ref` | `playerSummary()` (`competition.service.ts:250-256`) | `players()` sin división (1) |
| `/partidos/:ref` | `matchSummary()` (`competition.service.ts:137-159`) | `matchDirectory()` y `teamDirectory()` en paralelo, `match(id)` y `division()` (4) |
| `/editorial/:ref` | `HomeContentService.article()` | Las del servicio editorial; solo artículos publicados. |

Como en PostgreSQL, los UUID se comparan sin distinguir mayúsculas: `/equipos/{UUID en mayúsculas}` y `/jugadores/{UUID en mayúsculas}` describen la misma ficha que la API de detalle.

El número de consultas no depende del número de partidos del equipo ni del tamaño de las series. `matchSummary()` mantiene las reglas de `matchDetail()`: solo partidos `completed` o `forfeit`, con ambos equipos y la división existentes.

## 3. Textos generados

**Archivo**: `page-metadata.service.ts:79-118`

| Ficha | `title` | `description` |
|---|---|---|
| Equipo | Nombre del equipo | `Conoce la plantilla de {equipo} en {división}, temporada {temporada} de Rebel Crown Legacy.` |
| Jugador | `{gameName}#{riotTag}` (sin `#` si no hay tag) | `Consulta el perfil, los equipos y las estadísticas de {nombre} en Rebel Crown Legacy.` |
| Partido | `{local} vs {visitante}` | `{local} {marcador local}–{marcador visitante} {visitante}. Consulta los mapas y las estadísticas de esta serie de {división} en Rebel Crown Legacy.` |
| Artículo | Título | Extracto, o `{título}. Lee el artículo de {autor} en Rebel Crown Legacy.` si está vacío. |

Un `AppError` con estado 404 o un `ZodError` se traducen en los textos de página no encontrada. Cualquier otro error se propaga.

## 4. Caché en memoria

**Archivo**: `page-metadata.service.ts:7-68`

- **Clave**: la ruta recibida, tal cual.
- **TTL**: `DEFAULT_PAGE_METADATA_CACHE_TTL_MS` = 60 000 ms, configurable con la opción `cacheTtlMs`. Dentro del TTL, repetir la misma ficha no consulta la base de datos.
- **Single-flight**: mientras una ficha se está resolviendo, las peticiones concurrentes a la misma ruta comparten la promesa en curso (`inFlight`), igual que `SitemapService.getSitemapXml()`.
- **Errores**: una consulta que falla no se guarda; la siguiente petición vuelve a consultar. Sí se guardan los resultados de página no encontrada, para que referencias inexistentes repetidas tampoco consulten la base de datos.
- **Tamaño**: como máximo `DEFAULT_PAGE_METADATA_CACHE_MAX_ENTRIES` = 500 rutas (opción `cacheMaxEntries`). Al llenarse se eliminan primero las entradas caducadas y después las más antiguas.
- **Consistencia**: no hay invalidación explícita. Tras renombrar un equipo, cambiar un resultado o despublicar un artículo, la ficha puede mostrar los metadatos anteriores durante un máximo de 60 segundos. La caché es local a cada proceso de la API.

## 5. Pruebas

`apps/api/src/modules/page-metadata/page-metadata.test.ts` cubre los textos de cada ficha (también con UUID en mayúsculas), que los partidos programados, en directo o cancelados devuelven página no encontrada, el límite de entradas y el desalojo de la más antigua, que un equipo con 1 y con 20 partidos completados genera las mismas llamadas al repositorio, la caché dentro y fuera del TTL, la deduplicación de peticiones concurrentes y que los fallos no se guardan. `tests/integration/api-database.test.ts` comprueba los metadatos de equipo, jugador y partido contra PostgreSQL embebido (PGlite).
