# Rutas HTTP de Metadatos de Página

[⬅️ Volver a Metadatos de Página](README.md) | [Siguiente: Procesamiento y Caché ➡️](processing.md)

---

## 1. `GET /api/v1/page-metadata`

**Archivo**: `page-metadata.router.ts:8-17`

- **Query**: `path` (opcional). Si no es una cadena se usa `/`.
- **Respuesta**: HTTP 200 `{ data: { title, description } }`, con `Cache-Control: no-store`.
- Las rutas desconocidas y las fichas inexistentes devuelven los textos de página no encontrada (`title: "Página no encontrada"`), también con HTTP 200: el endpoint describe la página, no el recurso. Solo `data` (los metadatos) forma parte de la respuesta; el indicador `found` de `PageMetadataService.resolve()` no se expone.

## 2. HTML inicial de la web (`webPageRouter`)

**Archivo**: `page-metadata.router.ts:19-55`

Solo se monta cuando la API arranca con `WEB_DIST_DIR`.

- Sirve los ficheros estáticos de la web compilada, salvo `index.html`, que siempre pasa por la inserción de metadatos.
- Para peticiones `GET` o `HEAD` que aceptan HTML y no empiezan por `/api`, `/health`, `/ws`, `/assets`, `/images` o `/fonts`, lee `index.html`, llama a `PageMetadataService.resolve()` con la ruta y responde el HTML con `renderPageMetadata()` y `Cache-Control: no-cache`.
- **Código de estado**: `200` si `resolve()` devuelve `found: true` y `404` si devuelve `found: false`. El cuerpo es el mismo `index.html` con los textos de página no encontrada, de modo que la web sigue mostrando `NotFoundPage` y los buscadores no indexan la URL. Responden `404`:
  - las rutas que no están en `pageMetadata` (`@rcl/contracts`), por ejemplo `/ruta-inexistente`, `/equipos/a/b` o `/404`;
  - las fichas de equipo, jugador, partido o artículo cuya referencia no existe, no está publicada (artículos), no está terminada (partidos programados, en directo o cancelados) o no es una codificación URL válida ([processing.md](processing.md#2-consultas-por-tipo-de-ficha)).
- Responden `200`: `/`, `/index.html`, cada ruta de `pageMetadata` (con o sin barra final, también las de `/admin`) y las fichas existentes. Si la API arranca sin repositorio editorial, `/editorial/:ref` responde `200` con los textos genéricos de artículo, porque no puede comprobarse.
- `HEAD` sigue la misma lógica y devuelve el mismo código sin cuerpo.
- Un error que no sea de recurso no encontrado (por ejemplo, la base de datos no disponible) no se convierte en `404`: se propaga al manejador de errores de la API.
- `no-cache` obliga al navegador a revalidar el HTML; la reducción de consultas a la base de datos la aporta la caché del servicio ([processing.md](processing.md#4-caché-en-memoria)), no la del navegador.

Ambas rutas comparten la misma instancia de `PageMetadataService` (`apps/api/src/app.ts`), y por tanto la misma caché.

## 3. Alcance del código de estado

El `404` solo llega a quien recibe la respuesta de `webPageRouter`. Si delante de la API hay un proxy que sirve `index.html` como fichero estático para las rutas de la web (por ejemplo, con un `try_files ... /index.html`), esas respuestas siguen siendo `200` aunque la ruta no exista, y llevan los metadatos de inicio. Para que el `404` llegue a todos los clientes, el proxy debe enviar a la API las peticiones de página (`GET`/`HEAD` que aceptan HTML y no son ficheros existentes) en lugar de resolverlas con `index.html`.

