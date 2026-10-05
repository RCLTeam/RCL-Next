# Módulo API: Dynamic Sitemap XML

[⬅️ Volver a docs/api/](../README.md) | [Siguiente: Rutas HTTP ➡️](routes.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/sitemap/` proporciona la infraestructura de generación y exposición del mapa del sitio XML dinámico (`/api/sitemap.xml`) para la plataforma Rebel Crown Legacy. Su propósito es garantizar la indexación automatizada y exhaustiva en motores de búsqueda (Google, Bing) tanto de las rutas públicas fijas como de las entidades dependientes de la base de datos (equipos, jugadores y artículos editoriales).

El diseño del módulo se rige por los siguientes principios de arquitectura e ingeniería:

1. **Cumplimiento Estricto del Estándar Sitemaps 0.9:** La salida XML se adhiere a la especificación oficial con codificación UTF-8, declaración XML canónica, espacio de nombres `http://www.sitemaps.org/schemas/sitemap/0.9`, codificación exhaustiva de entidades especiales (`&`, `<`, `>`, `"`, `'`), marcas de tiempo en formato ISO 8601 (`YYYY-MM-DD`) y acotación estricta de prioridades en el rango numérico `[0.0, 1.0]`.
2. **Desacoplamiento Funcional y Generador Puro:** El algoritmo de construcción XML (`sitemap-builder.ts`) opera como una función pura sin estado mutable ni operaciones de I/O, facilitando su verificación determinista y aislando la lógica de serialización respecto al transporte y la base de datos.
3. **Caché en Memoria con Deduplicación Concurrente (*Single-Flight*):** El orquestador `SitemapService` implementa una caché en memoria de 12 horas (43.200.000 ms) respaldada por una promesa en vuelo compartida (`inFlightPromise`). Este mecanismo neutraliza el riesgo de tormentas de peticiones (*cache stampede / thundering herd*) cuando el TTL expira bajo ráfagas de rastreadores web.
4. **Proyección Relacional Mínima y Consultas Paralelas:** La capa de persistencia `PostgresSitemapRepository` utiliza Drizzle ORM para recuperar únicamente los identificadores y fechas de modificación requeridas (`id`, `updatedAt`, `createdAt`) sobre las tablas `teams` (`isActive = true`), `players` y `editorial_articles` (`published = true`), resolviendo las tres consultas de forma simultánea mediante `Promise.all`.
5. **Integración con Proxy Inverso y Cabeceras HTTP:** El enrutador Express emite cabeceras de respuesta `Content-Type: application/xml; charset=utf-8` y `Cache-Control: public, max-age=3600, s-maxage=43200`, permitiendo que el proxy inverso Nginx sirva la ruta pública `/sitemap.xml` directamente hacia el endpoint de la API con almacenamiento intermedio eficiente.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Controladores** | [routes.md](routes.md) | Exposición del endpoint `GET /api/sitemap.xml`, montaje en Express, cabeceras HTTP (`Cache-Control`, `Content-Type`), manejo de errores 404/500 e integración con Nginx. |
| **Lógica de Procesamiento** | [processing.md](processing.md) | Orquestación en `SitemapService`, catálogo de 11 rutas estáticas, resolución de URL base canónica, deduplicación *single-flight*, algoritmo puro de serialización y formateo de fechas. |
| **Persistencia y Consultas** | [persistence.md](persistence.md) | Interfaz `SitemapRepository`, implementación con Drizzle ORM sobre `teams`, `players` y `editorial_articles`, filtros activos/publicados y optimización de transferencias. |
| **Contratos y Tipos** | [contracts.md](contracts.md) | Definiciones de tipos TypeScript en `sitemap.types.ts` (`SitemapUrlEntry`, `SitemapChangeFrequency`, modelos de persistencia, opciones de servicio) y formato XML estándar. |

---

## 3. Consideraciones Operativas y de Rendimiento

- **Tiempo de Vida de la Caché (TTL):** El valor predeterminado es de 12 horas (`DEFAULT_SITEMAP_CACHE_TTL_MS = 43_200_000`). Para entornos de prueba o escenarios donde se requiera un refresco inmediato, el servicio proporciona el método explícito `invalidateCache()`.
- **Resolución de la URL Canónica:** El servicio examina la variable de entorno `FRONTEND_URL`. Si no está configurada o contiene un valor vacío, recurre a la raíz de producción `https://rebelcrownlegacy.es`. En cualquier caso, normaliza la cadena eliminando barras diagonales al final (`replace(/\/+$/, '')`).
- **Filtrado de Contenido Privado o en Borrador:** El repositorio excluye de forma estricta los equipos con `isActive = false` y los artículos editoriales con `published = false`, garantizando que únicamente recursos públicos aparezcan en el índice de rastreo.
