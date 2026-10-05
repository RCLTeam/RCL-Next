# Rutas HTTP: Dynamic Sitemap XML

[⬅️ Volver a Sitemap API](README.md) | [Siguiente: Lógica de Procesamiento ➡️](processing.md)

---

## 1. Visión General y Montaje del Enrutador

El enrutador del mapa del sitio XML se construye a través de la función factoría `sitemapRouter(service: SitemapService): Router` definida en `apps/api/src/modules/sitemap/sitemap.router.ts:4-22`. 

### 1.1 Registro en el Pipeline Express

El enrutador se registra en `apps/api/src/app.ts:162-167` bajo la ruta canónica `/api/sitemap.xml`:

```typescript
// apps/api/src/app.ts:162-167
const sitemapService =
  options.sitemapService ??
  (options.sitemapRepository ? new SitemapService(options.sitemapRepository) : undefined);
if (sitemapService) {
  app.use('/api/sitemap.xml', sitemapRouter(sitemapService));
}
```

En el arranque del servidor de producción (`apps/api/src/server.ts:83, 119`), se inicializa automáticamente la instancia `PostgresSitemapRepository` conectada a PostgreSQL mediante Drizzle ORM:

```typescript
// apps/api/src/server.ts:83
sitemapRepository: new PostgresSitemapRepository(connection.db),
```

### 1.2 Mapeo y Proxy Inverso en Nginx

En los entornos de despliegue, el servidor perimetral Nginx expone el archivo `robots.txt` apuntando a la dirección canónica:

```text
Sitemap: https://rebelcrownlegacy.es/sitemap.xml
```

Nginx redirige o transmite la petición `GET /sitemap.xml` internamente hacia el backend Node.js en `http://127.0.0.1:3001/api/sitemap.xml`.

---

## 2. Catálogo Canónico de Endpoints

| Método | Ruta Canónica | Acceso / Seguridad | Controlador / Acción | Ubicación en Código |
|---|---|---|---|---|
| `GET` | `/api/sitemap.xml` | Público (sin autenticación) | `handleSitemap` (`service.getSitemapXml()`) | `sitemap.router.ts:7-16` |

> **Nota de enrutamiento interno:** La función factoría en `sitemap.router.ts:18-19` escucha tanto en la raíz del sub-enrutador (`router.get('/', handleSitemap)`) como en la ruta explícita (`router.get('/sitemap.xml', handleSitemap)`). Debido a que está montado en `app.use('/api/sitemap.xml', ...)`, la URL pública canónica es `/api/sitemap.xml`.

---

## 3. Especificación Detallada de `GET /api/sitemap.xml`

### 3.1 Propósito
Genera y entrega un documento XML conforme al estándar Sitemaps 0.9 con todas las URLs estáticas y dinámicas indexables de Rebel Crown Legacy.

### 3.2 Parámetros de Entrada
- **Parámetros de Ruta:** Ninguno.
- **Parámetros de Consulta (Query):** Ninguno.
- **Cuerpo de Petición:** Ninguno (método `GET`).
- **Cabeceras Requeridas:** Ninguna. Acepta cabeceras estándar de clientes HTTP y navegadores.

### 3.3 Cabeceras de Respuesta HTTP

El controlador aplica explícitamente las siguientes cabeceras de transporte (`sitemap.router.ts:10-11`):

| Cabecera | Valor | Justificación Técnica |
|---|---|---|
| `Content-Type` | `application/xml; charset=utf-8` | Declara el tipo MIME específico de XML con juego de caracteres UTF-8 estricto. |
| `Cache-Control` | `public, max-age=3600, s-maxage=43200` | Define una directiva escalonada: los navegadores y clientes finales pueden retener el recurso hasta 1 hora (`3600` segundos), mientras que los servidores proxy compartidos, CDNs y proxies inversos pueden almacenarlo hasta 12 horas (`43200` segundos), coincidiendo con la vigencia de la caché en memoria del servicio. |

### 3.4 Códigos de Respuesta HTTP

- **`200 OK`:** Éxito. Retorna el cuerpo XML completo con declaración `<?xml version="1.0" encoding="UTF-8"?>` y el elemento raíz `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`.
- **`404 Not Found`:** Retornado cuando la aplicación Express se inicializa sin proporcionar `sitemapService` ni `sitemapRepository` en las opciones de `createApp`. En este escenario, la ruta no se monta en el enrutador y el middleware de recursos no encontrados responde con el esquema estándar:
  ```json
  {
    "error": {
      "code": "NOT_FOUND"
    }
  }
  ```
- **`500 Internal Server Error`:** Si ocurre un error inesperado al consultar la base de datos o al serializar las entradas XML, el bloque `try/catch` captura la excepción y ejecuta `next(error)` (`sitemap.router.ts:13-15`). El middleware global de gestión de errores captura el fallo y devuelve:
  ```json
  {
    "error": {
      "code": "INTERNAL_ERROR"
    }
  }
  ```

---

## 4. Ejemplo de Respuesta XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://rebelcrownlegacy.es/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
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
    <loc>https://rebelcrownlegacy.es/predicciones</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
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
    <loc>https://rebelcrownlegacy.es/ligas</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/playoffs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/champions</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/crystal-ball</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/equipos/10000000-0000-4000-8000-000000000001</loc>
    <lastmod>2026-09-01</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://rebelcrownlegacy.es/jugadores/20000000-0000-4000-8000-000000000001</loc>
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
