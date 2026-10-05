# Rutas HTTP de Metadatos de Página

[⬅️ Volver a Metadatos de Página](README.md) | [Siguiente: Procesamiento y Caché ➡️](processing.md)

---

## 1. `GET /api/v1/page-metadata`

**Archivo**: `page-metadata.router.ts:8-15`

- **Query**: `path` (opcional). Si no es una cadena se usa `/`.
- **Respuesta**: HTTP 200 `{ data: { title, description } }`, con `Cache-Control: no-store`.
- Las rutas desconocidas y las fichas inexistentes devuelven los textos de página no encontrada (`title: "Página no encontrada"`), también con HTTP 200: el endpoint describe la página, no el recurso.

## 2. HTML inicial de la web (`webPageRouter`)

**Archivo**: `page-metadata.router.ts:17-47`

Solo se monta cuando la API arranca con `WEB_DIST_DIR`.

- Sirve los ficheros estáticos de la web compilada, salvo `index.html`, que siempre pasa por la inserción de metadatos.
- Para peticiones `GET` o `HEAD` que aceptan HTML y no empiezan por `/api`, `/health`, `/ws`, `/assets`, `/images` o `/fonts`, lee `index.html`, llama a `PageMetadataService.resolve()` con la ruta y responde el HTML con `renderPageMetadata()` y `Cache-Control: no-cache`.
- `no-cache` obliga al navegador a revalidar el HTML; la reducción de consultas a la base de datos la aporta la caché del servicio ([processing.md](processing.md#4-caché-en-memoria)), no la del navegador.

Ambas rutas comparten la misma instancia de `PageMetadataService` (`apps/api/src/app.ts`), y por tanto la misma caché.
