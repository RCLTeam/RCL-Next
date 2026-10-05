# Rutas HTTP: Dynamic Sitemap XML

[⬅️ Volver a Sitemap API](README.md) | [Siguiente: Lógica de Procesamiento ➡️](processing.md)

---

## 1. Visión General y Montaje del Enrutador

El enrutador del mapa del sitio XML se construye con la función factoría `sitemapRouter(service: SitemapService): Router` definida en `apps/api/src/modules/sitemap/sitemap.router.ts:7-25`. Registra el mismo manejador en las rutas exactas de `SITEMAP_PATHS` (`sitemap.router.ts:5`): `/sitemap.xml` y `/api/sitemap.xml`.

### 1.1 Registro en el Pipeline Express

`createApp` construye el servicio justo después de `pageMetadataRouter`, para que la invalidación se registre antes que los enrutadores de administración (`apps/api/src/app.ts:72-83`):

```typescript
// apps/api/src/app.ts:72-83
const sitemapService =
  options.sitemapService ??
  (options.sitemapRepository ? new SitemapService(options.sitemapRepository) : undefined);
// Admin modules that change teams, players or articles refresh the sitemap on success.
if (sitemapService) {
  for (const path of [
    '/api/v1/database-transfer',
    '/api/v1/crud-operations',
    '/api/v1/home-content'
  ])
    app.use(path, invalidateSitemapOnWrite(sitemapService));
}
```

El enrutador se monta sin prefijo antes de `webPageRouter`, de modo que `/sitemap.xml` no cae en la página HTML de la web cuando `WEB_DIST_DIR` está configurado (`apps/api/src/app.ts:187`):

```typescript
// apps/api/src/app.ts:187
if (sitemapService) app.use(sitemapRouter(sitemapService));
```

En el arranque del servidor de producción (`apps/api/src/server.ts:87`), se inicializa la instancia `PostgresSitemapRepository` conectada a PostgreSQL mediante Drizzle ORM:

```typescript
// apps/api/src/server.ts:87
sitemapRepository: new PostgresSitemapRepository(connection.db),
```

### 1.2 Invalidación tras Escrituras de Administración

`invalidateSitemapOnWrite(service)` (`apps/api/src/modules/sitemap/sitemap-invalidation.ts:11-20`) se ejecuta antes que los enrutadores de `crud-operations`, `home-content` y `database-transfer`. Para métodos distintos de `GET`, `HEAD` y `OPTIONS` se suscribe al evento `finish` de la respuesta y, si el estado es inferior a `400`, llama a `service.invalidateCache()`. Las escrituras rechazadas (por ejemplo `401`, `403` o `422`) conservan la caché.

Así, tras crear o renombrar un equipo o un jugador, publicar o editar un artículo, o importar una copia de la base de datos, la siguiente petición al sitemap ya refleja el cambio.

### 1.3 Proxy Inverso, `robots.txt` y Ruta Pública

En producción, el proxy inverso (nginx) responde `/robots.txt` con un texto fijo definido en su propia configuración, que incluye la línea `Sitemap: https://rebelcrownlegacy.es/sitemap.xml`. El repositorio no contiene un `robots.txt`: un fichero en `apps/web/public` no llegaría a servirse.

El mismo proxy envía `/sitemap.xml` a la API (`/api/sitemap.xml`). La ruta `/sitemap.xml` que registra la propia API queda para cuando se use sin proxy: como el enrutador se monta antes de `webPageRouter`, con `WEB_DIST_DIR` configurado devuelve el XML y no el `index.html` de la web. Ambas rutas devuelven el mismo documento.

---

## 2. Catálogo Canónico de Endpoints

| Método | Ruta | Acceso / Seguridad | Controlador / Acción | Ubicación en Código |
|---|---|---|---|---|
| `GET` | `/sitemap.xml` | Público (sin autenticación) | `handleSitemap` (`service.getSitemapXml()`) | `sitemap.router.ts:10-20` |
| `GET` | `/api/sitemap.xml` | Público (sin autenticación) | `handleSitemap` (`service.getSitemapXml()`) | `sitemap.router.ts:10-20` |

> **Nota de enrutamiento:** Solo existen esas dos rutas exactas. Rutas anidadas como `/api/sitemap.xml/sitemap.xml` no se registran y responden `404 NOT_FOUND`.

---

## 3. Especificación Detallada de `GET /sitemap.xml`

### 3.1 Propósito
Genera y entrega un documento XML conforme al estándar Sitemaps 0.9 con todas las URLs estáticas y dinámicas indexables de Rebel Crown Legacy.

### 3.2 Parámetros de Entrada
- **Parámetros de Ruta:** Ninguno.
- **Parámetros de Consulta (Query):** Ninguno.
- **Cuerpo de Petición:** Ninguno (método `GET`).
- **Cabeceras Requeridas:** Ninguna. Acepta cabeceras estándar de clientes HTTP y navegadores.

### 3.3 Cabeceras de Respuesta HTTP

El controlador aplica explícitamente las siguientes cabeceras de transporte (`sitemap.router.ts:13-15`):

| Cabecera | Valor | Justificación Técnica |
|---|---|---|
| `Content-Type` | `application/xml; charset=utf-8` | Declara el tipo MIME específico de XML con juego de caracteres UTF-8 estricto. |
| `Cache-Control` | `public, max-age=300` | Navegadores, proxies y CDNs pueden retener el documento hasta 5 minutos. Es deliberadamente corto: la caché en memoria del servicio se invalida tras cada escritura de administración, y una caché compartida larga ocultaría esos cambios. |

### 3.4 Códigos de Respuesta HTTP

- **`200 OK`:** Éxito. Retorna el cuerpo XML completo con declaración `<?xml version="1.0" encoding="UTF-8"?>` y el elemento raíz `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`.
- **`404 Not Found`:** Retornado para rutas anidadas como `/api/sitemap.xml/sitemap.xml`, y para las dos rutas del sitemap cuando la aplicación Express se inicializa sin proporcionar `sitemapService` ni `sitemapRepository` en las opciones de `createApp`. En este escenario, la ruta no se monta en el enrutador y el middleware de recursos no encontrados responde con el esquema estándar:
  ```json
  {
    "error": {
      "code": "NOT_FOUND"
    }
  }
  ```
- **`500 Internal Server Error`:** Si ocurre un error inesperado al consultar la base de datos o al serializar las entradas XML, el bloque `try/catch` captura la excepción y ejecuta `next(error)` (`sitemap.router.ts:17-19`). El middleware global de gestión de errores captura el fallo y devuelve:
  ```json
  {
    "error": {
      "code": "INTERNAL_ERROR"
    }
  }
  ```

---

## 4. Ejemplo de Respuesta XML

Las rutas estáticas aparecen en el orden de `pageMetadata`. Los equipos y jugadores usan su slug público:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://rebelcrownlegacy.es/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/ligas</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/calendario</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/clasificacion</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/equipos</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/jugadores</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/campeones</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/predicciones</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/bola-cristal</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/playoffs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/equipos/lobos-demo</loc>
    <lastmod>2026-09-01</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/jugadores/jugador-demo-1-demo</loc>
    <lastmod>2026-09-05</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/editorial/30000000-0000-4000-8000-000000000001</loc>
    <lastmod>2026-09-10</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
```
