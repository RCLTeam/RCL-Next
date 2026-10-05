# Lógica de Procesamiento y Algoritmos: Dynamic Sitemap XML

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General de la Capa de Procesamiento

La capa de procesamiento del módulo (`apps/api/src/modules/sitemap/processing/`) asume la responsabilidad de coordinar la obtención de datos, gobernar el ciclo de vida de la memoria caché y transformar las entradas en un documento XML válido y serializado.

El subsistema se estructura en dos componentes complementarios:

1. **`SitemapService` (`sitemap.service.ts`):** Servicio orquestador que deriva las rutas estáticas de `pageMetadata`, calcula los slugs públicos de equipos y jugadores, resuelve el dominio canónico y gestiona la caché en memoria (invalidación explícita, TTL de respaldo de 1 hora y deduplicación de peticiones concurrentes, *single-flight pattern*).
2. **`sitemap-builder.ts`:** Módulo funcional compuesto por funciones deterministas puras para el escapado de caracteres según el estándar XML 1.0, formateo de marcas de tiempo en ISO 8601 y ensamblado de la estructura XML del protocolo Sitemaps 0.9.

---

## 2. Orquestador de Servicio y Estrategia de Caché (`sitemap.service.ts`)

La clase `SitemapService` implementa el ciclo de vida de generación y entrega del documento XML.

### 2.1 Configuración y Parámetros del Servicio

El servicio puede instanciarse con opciones opcionales a través de la interfaz `SitemapServiceOptions`:

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:7-13
// Admin writes invalidate the cache; the TTL only bounds changes made outside the API.
export const DEFAULT_SITEMAP_CACHE_TTL_MS = 60 * 60 * 1000; // 3,600,000 ms (1 hour)

export interface SitemapServiceOptions {
  baseUrl?: string;
  cacheTtlMs?: number;
}
```

- **`cacheTtlMs`:** Tiempo de validez de la caché en milisegundos. Por defecto, `3_600_000` (1 hora). Es un respaldo: las escrituras de administración invalidan la caché de inmediato (ver [routes.md](routes.md#12-invalidación-tras-escrituras-de-administración)).
- **`baseUrl`:** URL base de la aplicación cliente. Si se omite, se evalúa `process.env.FRONTEND_URL` o se asume el valor de respaldo `https://rebelcrownlegacy.es`.

### 2.2 Resolución de URL Base Canónica (`getBaseUrl`)

Para prevenir discrepancias en las URLs generadas o la presencia de barras diagonales redundantes, el método privado `getBaseUrl()` (`sitemap.service.ts:60-66`) aplica un orden de resolución determinista y normaliza la salida eliminando cualquier barra final:

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:60-66
private getBaseUrl(): string {
  const envUrl = process.env.FRONTEND_URL;
  const candidate =
    this.options?.baseUrl ?? (envUrl && envUrl !== 'undefined' ? envUrl : undefined);
  const raw = candidate?.trim() || 'https://rebelcrownlegacy.es';
  return raw.replace(/\/+$/, '');
}
```

### 2.3 Patrón de Caché y Deduplicación Concurrente (*Single-Flight*)

Bajo condiciones de tráfico elevado o durante el rastreo simultáneo por múltiples bots (Googlebot, Bingbot), la expiración de una caché en memoria puede generar una tormenta de peticiones concurrentes (*cache stampede* o *thundering herd*). Si múltiples hilos asíncronos intentaran regenerar el sitemap a la vez, se dispararían consultas duplicadas contra PostgreSQL.

Para resolver este problema, `SitemapService` emplea el patrón de promesa en vuelo compartida (`inFlightPromise`):

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:71-101
async getSitemapXml(): Promise<string> {
  const now = Date.now();

  if (
    this.cachedXml !== null &&
    this.cachedAt !== null &&
    now - this.cachedAt < this.cacheTtlMs
  ) {
    return this.cachedXml;
  }

  if (this.inFlightPromise !== null) {
    return this.inFlightPromise;
  }

  const generation = this.generation;
  const promise = this.generateXml();
  this.inFlightPromise = promise;

  try {
    const xml = await promise;
    // A generation started before invalidateCache() may hold stale data: never cache it.
    if (generation === this.generation) {
      this.cachedXml = xml;
      this.cachedAt = Date.now();
    }
    return xml;
  } finally {
    if (this.inFlightPromise === promise) this.inFlightPromise = null;
  }
}
```

#### Flujo de Ejecución:
1. **Acierto de Caché:** Si `cachedXml` contiene el documento y el tiempo transcurrido desde `cachedAt` es menor que `cacheTtlMs`, se retorna el XML almacenado de inmediato sin realizar I/O ni serialización.
2. **Deduplicación Concurrente:** Si no hay caché válida pero existe una promesa en vuelo (`inFlightPromise !== null`), todas las solicitudes concurrentes se suscriben a esa misma promesa y reciben el mismo resultado.
3. **Regeneración Controlada:** La primera solicitud sin caché anota la generación actual, inicia `generateXml()` y guarda la promesa en `inFlightPromise`. Al resolverse, solo almacena el resultado si no ha habido una invalidación entre medias; en el bloque `finally` libera `inFlightPromise` únicamente si sigue apuntando a su propia promesa.

### 2.4 Invalidación Explícita de Caché (`invalidateCache`)

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:107-112
invalidateCache(): void {
  this.generation++;
  this.cachedXml = null;
  this.cachedAt = null;
  this.inFlightPromise = null;
}
```

Reinicia el estado interno para que la siguiente petición consulte la base de datos. El contador `generation` impide que una generación que ya estaba en curso cuando se invalidó (y que pudo leer datos anteriores al cambio) se guarde en la caché: quien la esperaba recibe su resultado, pero la siguiente petición vuelve a generar el documento.

`createApp` llama a este método a través de `invalidateSitemapOnWrite` tras cada escritura correcta en `/api/v1/crud-operations`, `/api/v1/home-content` y `/api/v1/database-transfer` (ver [routes.md](routes.md#12-invalidación-tras-escrituras-de-administración)).

---

## 3. Catálogo de Rutas Indexadas

El método privado `generateXml()` reúne tanto las rutas estáticas predefinidas del frontend como las entidades dinámicas expuestas por el repositorio.

### 3.1 Rutas Estáticas de la Plataforma (`SITEMAP_STATIC_PATHS`)

Las rutas estáticas no se mantienen en una lista propia: `SITEMAP_STATIC_PATHS` (`sitemap.service.ts:35-41`) toma las claves de `pageMetadata` (`packages/contracts/src/page-metadata.ts`), que es la misma tabla que usa la web para los títulos de cada ruta, y excluye `/admin` y sus subrutas. Si se añade o renombra una página pública en `pageMetadata`, el sitemap la refleja sin cambios en este módulo.

`STATIC_ROUTE_SETTINGS` (`sitemap.service.ts:22-33`) solo aporta la prioridad y la frecuencia de cada ruta; las rutas sin entrada usan `DEFAULT_STATIC_ROUTE_SETTINGS` (`priority: 0.5`, `changefreq: 'weekly'`, línea 20):

| Ruta | Prioridad (`priority`) | Frecuencia de Cambio (`changefreq`) | Contenido |
|---|:---:|:---:|---|
| `/` | `1.0` | `daily` | Portada principal y noticias destacadas de la liga. |
| `/calendario` | `0.9` | `daily` | Encuentros, jornadas y resultados. |
| `/clasificacion` | `0.9` | `daily` | Clasificación de la fase regular por división. |
| `/predicciones` | `0.8` | `weekly` | Pronósticos de cada jornada. |
| `/equipos` | `0.8` | `weekly` | Directorio de equipos. |
| `/jugadores` | `0.8` | `weekly` | Directorio de jugadores. |
| `/ligas` | `0.7` | `weekly` | Divisiones y formato de competición. |
| `/playoffs` | `0.7` | `weekly` | Eliminatorias y fases finales. |
| `/campeones` | `0.6` | `weekly` | Selecciones y victorias por campeón. |
| `/bola-cristal` | `0.6` | `weekly` | Predicciones de temporada. |

Los tests (`sitemap.service.test.ts`) comprueban que toda URL estática del sitemap devuelve metadatos válidos con `getPageMetadata()` (nunca «Página no encontrada») y que el conjunto coincide con las claves públicas de `pageMetadata`.

### 3.2 Rutas Dinámicas de Base de Datos

El servicio ejecuta concurrentemente con `Promise.all` las tres consultas del repositorio (`sitemap.service.ts:118-122`) y calcula los slugs con las mismas funciones que la API de competición (`sitemap.service.ts:137-141`):

```typescript
// Same slugs and fallback as the web links (`slug ?? id`, URI-encoded).
const teamSlugs = teamProfileSlugs(teams);
const playerSlugs = playerProfileSlugs(players);
const profilePath = (slugs: Map<string, string>, id: string) =>
  encodeURIComponent(slugs.get(id) ?? id);
```

`teamProfileSlugs` y `playerProfileSlugs` (`apps/api/src/modules/competition/profile-slugs.ts:62-85`) encapsulan la entrada de `profileSlugs` que también usa `CompetitionService`: nombre del equipo con contexto `temporada división` y prefijo `equipo`, y `gameName riotTag` con prefijo `jugador`. Como `profileSlugs` desambigua sobre el directorio completo, el repositorio devuelve todos los equipos (activos e inactivos) y el servicio publica solo los activos.

1. **Equipos (`teams`, solo `isActive = true`):**
   - URL: `${baseUrl}/equipos/${encodeURIComponent(slug)}`
   - `lastmod`: `formatSitemapDate(team.updatedAt)` (`YYYY-MM-DD`).
   - `changefreq`: `'weekly'`
   - `priority`: `0.7`
2. **Jugadores (`players`):**
   - URL: `${baseUrl}/jugadores/${encodeURIComponent(slug)}`
   - `lastmod`: `formatSitemapDate(player.updatedAt)` (`YYYY-MM-DD`).
   - `changefreq`: `'weekly'`
   - `priority`: `0.6`
3. **Artículos Editoriales (`editorialArticles`, solo publicados):**
   - URL: `${baseUrl}/editorial/${article.id}` (la web enlaza los artículos por su identificador).
   - `lastmod`: `formatSitemapDate(article.updatedAt)` (`YYYY-MM-DD`).
   - `changefreq`: `'monthly'`
   - `priority`: `0.7`

`tests/integration/sitemap-database.test.ts` compara, sobre PostgreSQL embebido (PGlite), las URLs de equipos y jugadores del sitemap con el campo `slug` de `GET /api/v1/divisions/:divisionId/teams`, `GET /api/v1/players` y las fichas `GET /api/v1/teams/:teamId` y `GET /api/v1/players/:playerId`, incluidos nombres repetidos entre divisiones y caracteres no ASCII.

---

## 4. Algoritmo de Construcción XML (`sitemap-builder.ts`)

El archivo `apps/api/src/modules/sitemap/processing/sitemap-builder.ts` implementa la serialización XML pura, garantizando ausencia de efectos colaterales y compatibilidad estricta con XML 1.0.

### 4.1 Escapado de Caracteres XML (`escapeXml`)

La especificación XML requiere que cinco caracteres reservados sean reemplazados por sus correspondientes entidades:

```typescript
// apps/api/src/modules/sitemap/processing/sitemap-builder.ts:6-13
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

El orden de reemplazo sitúa el ampersand (`&`) en primer lugar, impidiendo el doble escapado involuntario de entidades ya formateadas.

### 4.2 Formateo Defensivo de Fechas (`formatSitemapDate`)

El estándar Sitemaps 0.9 acepta fechas en formato W3C Datetime (`YYYY-MM-DD`). La función `formatSitemapDate` valida activamente la integridad del objeto `Date`:

```typescript
// apps/api/src/modules/sitemap/processing/sitemap-builder.ts:18-23
export function formatSitemapDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid date provided to formatSitemapDate');
  }
  return date.toISOString().slice(0, 10);
}
```

Si el valor proporcionado es un objeto `Date` con marca temporal inválida (`NaN`), la función rechaza la operación inmediatamente arrojando un error tipado `RangeError`.

### 4.3 Ensamblado del Documento (`buildSitemapXml`)

La función `buildSitemapXml(urls: SitemapUrlEntry[]): string` itera la colección de URLs y produce el documento completo:

```typescript
// apps/api/src/modules/sitemap/processing/sitemap-builder.ts:29-55
export function buildSitemapXml(urls: SitemapUrlEntry[]): string {
  const urlNodes = urls.map((entry) => {
    const lines = ['  <url>', `    <loc>${escapeXml(entry.loc)}</loc>`];

    if (entry.lastmod) {
      lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    }

    if (entry.changefreq) {
      lines.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`);
    }

    if (typeof entry.priority === 'number' && !Number.isNaN(entry.priority)) {
      const clamped = Math.max(0.0, Math.min(1.0, entry.priority));
      lines.push(`    <priority>${clamped.toFixed(1)}</priority>`);
    }

    lines.push('  </url>');
    return lines.join('\n');
  });

  if (urlNodes.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>';
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlNodes.join('\n')}\n</urlset>`;
}
```

#### Reglas de Normalización:
1. **Acotado de Prioridad (*Clamping*):** La prioridad se confina defensivamente al intervalo `[0.0, 1.0]` utilizando `Math.max(0.0, Math.min(1.0, entry.priority))` y se formatea con un único decimal (`clamped.toFixed(1)`).
2. **Elementos Opcionales:** Si `lastmod`, `changefreq` o `priority` son omitidos o indefinidos, sus correspondientes etiquetas XML no se insertan en el bloque `<url>`, conservando la respuesta compacta y válida.
3. **Manejo de Lista Vacía:** Si la colección `urls` está vacía, devuelve el elemento `<urlset>` sin hijos en lugar de un documento corrupto o cadenas vacías.
