# Descripciones al compartir enlaces

`packages/contracts/src/page-metadata.ts` define `PageMetadata` (`title` y `description`) y los textos por ruta. `App` pasa esta variable a `PageHead`, que actualiza las etiquetas del `<head>` al navegar. La API completa las fichas con los nombres de equipos y jugadores, los resultados de partidos y el extracto de los artículos publicados. Las fichas se resuelven con consultas ligeras y se guardan 60 segundos en una caché del servidor, así que un cambio de nombre o de resultado puede tardar hasta ese tiempo en aparecer en los metadatos; el funcionamiento de la API está descrito en [docs/api/page-metadata](../api/page-metadata/README.md).

El HTML contiene `description`, `og:description` y `twitter:description`, junto con sus títulos. Los valores se escapan antes de insertarlos en la plantilla. Las páginas desconocidas y los recursos inexistentes tienen un texto de página no disponible.

## Desarrollo y despliegue

Vite inserta los metadatos en el HTML inicial durante desarrollo y preview. Para las fichas, la API local debe estar disponible en el puerto 3001, igual que el proxy existente.

En producción, ejecuta `pnpm build` y establece `WEB_DIST_DIR` en la **ruta absoluta de `apps/web/dist`** al arrancar la API. El servidor Express servirá los archivos compilados y completará el HTML para cada enlace. El dominio público debe dirigir las rutas de páginas a ese servidor, además de las rutas de API y WebSocket. Sin `WEB_DIST_DIR`, la API mantiene su funcionamiento anterior.

Servir únicamente `dist/index.html` desde un alojamiento estático devuelve los metadatos de inicio para todas las rutas; para que las vistas previas sean específicas hay que usar el servidor indicado. Las aplicaciones que ya hayan almacenado una vista previa pueden conservarla hasta renovar su caché.

## Añadir una página

Añade su entrada a `pageMetadata`, además de su ruta en `apps/web/src/site/routes.tsx`. Para una ficha nueva, amplía `PageMetadataService` y el reconocimiento de rutas de detalle en `PageHead` y el plugin de Vite. El endpoint de metadatos utiliza únicamente datos públicos, incluidas las comprobaciones de publicación de artículos del servicio existente.
