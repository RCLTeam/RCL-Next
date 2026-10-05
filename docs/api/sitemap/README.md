# Módulo API: Dynamic Sitemap XML

[⬅️ Volver a docs/api/](../README.md) | [Siguiente: Rutas HTTP ➡️](routes.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/sitemap/` proporciona la infraestructura de generación y exposición del mapa del sitio XML dinámico (`/sitemap.xml`, también disponible en `/api/sitemap.xml`) para la plataforma Rebel Crown Legacy. Su propósito es garantizar la indexación automatizada y exhaustiva en motores de búsqueda (Google, Bing) tanto de las rutas públicas fijas como de las entidades dependientes de la base de datos (equipos, jugadores y artículos editoriales).

El diseño del módulo se rige por los siguientes principios de arquitectura e ingeniería:

1. **Cumplimiento Estricto del Estándar Sitemaps 0.9:** La salida XML se adhiere a la especificación oficial con codificación UTF-8, declaración XML canónica, espacio de nombres `http://www.sitemaps.org/schemas/sitemap/0.9`, codificación exhaustiva de entidades especiales (`&`, `<`, `>`, `"`, `'`), marcas de tiempo en formato ISO 8601 (`YYYY-MM-DD`) y acotación estricta de prioridades en el rango numérico `[0.0, 1.0]`.
2. **Desacoplamiento Funcional y Generador Puro:** El algoritmo de construcción XML (`sitemap-builder.ts`) opera como una función pura sin estado mutable ni operaciones de I/O, facilitando su verificación determinista y aislando la lógica de serialización respecto al transporte y la base de datos.
3. **Las mismas URLs que la web:** Las rutas estáticas se derivan de `pageMetadata` (`@rcl/contracts`), excluyendo `/admin` y sus subrutas, de modo que el sitemap no puede anunciar una página que la web no sirve. Los equipos y jugadores se publican con el mismo slug que devuelve la API de competición (`teamProfileSlugs` y `playerProfileSlugs` de `apps/api/src/modules/competition/profile-slugs.ts`), codificado con `encodeURIComponent` igual que los enlaces de la web.
4. **Caché en Memoria con Invalidación y Deduplicación Concurrente (*Single-Flight*):** El orquestador `SitemapService` mantiene el XML en memoria con una promesa en vuelo compartida (`inFlightPromise`) que evita regeneraciones simultáneas. Las escrituras correctas en los módulos de administración (`crud-operations`, `home-content` y `database-transfer`) invalidan la caché, y un TTL de respaldo de 1 hora acota los cambios hechos fuera de la API.
5. **Proyección Relacional Mínima y Consultas Paralelas:** `PostgresSitemapRepository` recupera solo los campos necesarios para construir los slugs y las fechas de modificación sobre `teams` (con su temporada y división), `players` y `editorial_articles` (`published = true`), resolviendo las tres consultas con `Promise.all`.
6. **Cabeceras HTTP y `robots.txt`:** El enrutador responde con `Content-Type: application/xml; charset=utf-8` y `Cache-Control: public, max-age=300`. `apps/web/public/robots.txt` declara `Sitemap: https://rebelcrownlegacy.es/sitemap.xml`, ruta que la propia API atiende antes del enrutador de páginas web.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Controladores** | [routes.md](routes.md) | Endpoints `GET /sitemap.xml` y `GET /api/sitemap.xml`, montaje en Express, invalidación tras escrituras de administración, cabeceras HTTP, `robots.txt` y manejo de errores 404/500. |
| **Lógica de Procesamiento** | [processing.md](processing.md) | Orquestación en `SitemapService`, rutas estáticas derivadas de `pageMetadata`, slugs de equipos y jugadores, resolución de URL base, caché con invalidación y *single-flight*, serialización y formateo de fechas. |
| **Persistencia y Consultas** | [persistence.md](persistence.md) | Interfaz `SitemapRepository`, implementación con Drizzle ORM sobre `teams` (con temporada y división), `players` y `editorial_articles`, y filtro de artículos publicados. |
| **Contratos y Tipos** | [contracts.md](contracts.md) | Definiciones de tipos TypeScript en `sitemap.types.ts` (`SitemapUrlEntry`, `SitemapChangeFrequency`, modelos de persistencia, opciones de servicio) y formato XML estándar. |

---

## 3. Consideraciones Operativas y de Rendimiento

- **Invalidación y TTL:** `invalidateSitemapOnWrite` (`sitemap-invalidation.ts`) llama a `invalidateCache()` cuando una petición de escritura (`POST`, `PUT`, `PATCH`, `DELETE`) a `/api/v1/crud-operations`, `/api/v1/home-content` o `/api/v1/database-transfer` termina con un estado inferior a `400`. El TTL de respaldo es de 1 hora (`DEFAULT_SITEMAP_CACHE_TTL_MS = 3_600_000`) y cubre cambios que no pasan por la API, como inserciones directas en la base de datos.
- **Resolución de la URL Canónica:** El servicio examina la variable de entorno `FRONTEND_URL`. Si no está configurada o contiene un valor vacío, recurre a la raíz de producción `https://rebelcrownlegacy.es`. En cualquier caso, normaliza la cadena eliminando barras diagonales al final (`replace(/\/+$/, '')`).
- **Filtrado de Contenido Privado o en Borrador:** Solo se publican los equipos con `isActive = true` y los artículos con `published = true`. Los equipos inactivos se leen igualmente porque participan en la desambiguación de slugs, igual que en la API de competición.
