# Módulo API: Metadatos de Página

[⬅️ Volver a docs/api/](../README.md) | [Siguiente: Rutas HTTP ➡️](routes.md)

---

## 1. Resumen

El módulo `apps/api/src/modules/page-metadata/` resuelve el `<title>` y la `<meta name="description">` de cada ruta pública de la web. Las rutas fijas usan los textos de `getPageMetadata()` (`@rcl/contracts`); las fichas de equipo, jugador, partido y artículo se completan con datos de la base de datos.

Se expone de dos formas:

- `GET /api/v1/page-metadata?path=` devuelve los metadatos en JSON.
- `webPageRouter`, cuando la API sirve la web compilada (`WEB_DIST_DIR`), inserta los metadatos en el `index.html` de cada petición de página, de modo que las vistas previas de enlaces los reciben sin ejecutar JavaScript.

Las fichas se resuelven con proyecciones ligeras de `CompetitionService` (número de consultas fijo, sin depender de los partidos del equipo) y el resultado se guarda en una caché en memoria de 60 segundos con deduplicación de peticiones concurrentes.

La integración con la web (`PageHead`, plugin de Vite y despliegue) está en [docs/web/page-metadata.md](../../web/page-metadata.md).

---

## 2. Contenido

| Documento | Resumen |
|---|---|
| [routes.md](routes.md) | Endpoint JSON, servicio del HTML con metadatos, cabeceras `Cache-Control` y rutas excluidas. |
| [processing.md](processing.md) | Reconocimiento de fichas, consultas ligeras por tipo de ficha, textos generados, respuestas de página no encontrada y caché con TTL y *single-flight*. |
