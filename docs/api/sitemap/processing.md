# Lógica de Procesamiento y Algoritmos: Dynamic Sitemap XML

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General de la Capa de Procesamiento

La capa de procesamiento del módulo (`apps/api/src/modules/sitemap/processing/`) asume la responsabilidad de coordinar la obtención de datos, gobernar el ciclo de vida de la memoria caché y transformar las entradas en un documento XML válido y serializado.

El subsistema se estructura en dos componentes complementarios:

1. **`SitemapService` (`sitemap.service.ts`):** Servicio orquestador que gestiona la configuración de rutas, la resolución canónica de dominios, la caché en memoria con TTL de 12 horas y la deduplicación de peticiones concurrentes (*single-flight pattern*).
2. **`sitemap-builder.ts`:** Módulo funcional compuesto por funciones deterministas puras para el escapado de caracteres según el estándar XML 1.0, formateo de marcas de tiempo en ISO 8601 y ensamblado de la estructura XML del protocolo Sitemaps 0.9.

---

## 2. Orquestador de Servicio y Estrategia de Caché (`sitemap.service.ts`)

La clase `SitemapService` implementa el ciclo de vida de generación y entrega del documento XML.

### 2.1 Configuración y Parámetros del Servicio

El servicio puede instanciarse con opciones opcionales a través de la interfaz `SitemapServiceOptions`:

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:5-10
export const DEFAULT_SITEMAP_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 43,200,000 ms (12 horas)

export interface SitemapServiceOptions {
  baseUrl?: string;
  cacheTtlMs?: number;
}
```

- **`cacheTtlMs`:** Tiempo de validez de la caché en milisegundos. Por defecto, `43_200_000` (12 horas).
- **`baseUrl`:** URL base de la aplicación cliente. Si se omite, se evalúa `process.env.FRONTEND_URL` o se asume el valor de respaldo `https://rebelcrownlegacy.es`.

### 2.2 Resolución de URL Base Canónica (`getBaseUrl`)

Para prevenir discrepancias en las URLs generadas o la presencia de barras diagonales redundantes, el método privado `getBaseUrl()` (`sitemap.service.ts:47-53`) aplica un orden de resolución determinista y normaliza la salida eliminando cualquier barra final:

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:47-53
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
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:58-83
async getSitemapXml(): Promise<string> {
  const now = Date.now();

  // 1. Acierto de caché en memoria vigente
  if (
    this.cachedXml !== null &&
    this.cachedAt !== null &&
    now - this.cachedAt < this.cacheTtlMs
  ) {
    return this.cachedXml;
  }

  // 2. Si ya hay una generación en curso, reusar la misma promesa compartida
  if (this.inFlightPromise !== null) {
    return this.inFlightPromise;
  }

  // 3. Crear la promesa compartida y ejecutar la generación
  this.inFlightPromise = this.generateXml();

  try {
    const xml = await this.inFlightPromise;
    this.cachedXml = xml;
    this.cachedAt = Date.now();
    return xml;
  } finally {
    this.inFlightPromise = null;
  }
}
```

#### Flujo de Ejecución:
1. **Acierto de Caché:** Si `cachedXml` contiene el documento y el tiempo transcurrido desde `cachedAt` es menor que `cacheTtlMs`, se retorna el XML almacenado de inmediato sin realizar I/O ni serialización.
2. **Deduplicación Concurrente:** Si no hay caché válida pero existe una promesa en vuelo (`inFlightPromise !== null`), todas las solicitudes concurrentes se suscriben a esa misma promesa y reciben el mismo resultado tan pronto como se resuelva.
3. **Regeneración Controlada:** La primera solicitud sin caché inicia `generateXml()` y asigna la referencia a `inFlightPromise`. Una vez resuelta, almacena el resultado en `cachedXml`, actualiza `cachedAt` y en el bloque `finally` libera `inFlightPromise` a `null`.

### 2.4 Invalidación Explícita de Caché (`invalidateCache`)

El servicio expone el método `invalidateCache(): void` (`sitemap.service.ts:88-92`):

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:88-92
invalidateCache(): void {
  this.cachedXml = null;
  this.cachedAt = null;
  this.inFlightPromise = null;
}
```

Este método reinicia el estado interno, forzando a que la siguiente petición ejecute las consultas a base de datos y reconstruya el XML.

---

## 3. Catálogo de Rutas Indexadas

El método privado `generateXml()` reúne tanto las rutas estáticas predefinidas del frontend como las entidades dinámicas expuestas por el repositorio.

### 3.1 Rutas Estáticas de la Plataforma (`STATIC_ROUTES`)

Definidas en `sitemap.service.ts:18-29`, abarcan las secciones fijas de la plataforma:

| Ruta | Prioridad (`priority`) | Frecuencia de Cambio (`changefreq`) | Justificación de Negocio |
|---|:---:|:---:|---|
| `/` | `1.0` | `daily` | Portada principal y noticias destacadas de la liga. |
| `/calendario` | `0.9` | `daily` | Cronograma de partidos, horarios y resultados actualizados en vivo. |
| `/clasificacion` | `0.9` | `daily` | Tablas de posiciones de las divisiones de la competición. |
| `/predicciones` | `0.8` | `weekly` | Sistema de votación semanal de la comunidad. |
| `/equipos` | `0.8` | `weekly` | Directorio general de escuadras inscritas. |
| `/jugadores` | `0.8` | `weekly` | Directorio general de convocatorias de jugadores. |
| `/ligas` | `0.7` | `weekly` | Información general de temporadas y divisiones. |
| `/playoffs` | `0.7` | `weekly` | Cuadros eliminatorios y fases finales de temporada. |
| `/champions` | `0.6` | `weekly` | Información del torneo Champions de la comunidad. |
| `/crystal-ball` | `0.6` | `weekly` | Predicciones globales a largo plazo de la competición. |

### 3.2 Rutas Dinámicas de Base de Datos

El servicio ejecuta concurrentemente con `Promise.all` las tres consultas del repositorio (`sitemap.service.ts:98-102`):

1. **Equipos (`teams`):**
   - URL: `${baseUrl}/equipos/${team.id}`
   - `lastmod`: Formateado en ISO `YYYY-MM-DD` mediante `formatSitemapDate(team.updatedAt)`.
   - `changefreq`: `'weekly'`
   - `priority`: `0.7`
2. **Jugadores (`players`):**
   - URL: `${baseUrl}/jugadores/${player.id}`
   - `lastmod`: Formateado en ISO `YYYY-MM-DD` mediante `formatSitemapDate(player.updatedAt)`.
   - `changefreq`: `'weekly'`
   - `priority`: `0.6`
3. **Artículos Editoriales (`editorialArticles`):**
   - URL: `${baseUrl}/editorial/${article.id}`
   - `lastmod`: Formateado en ISO `YYYY-MM-DD` mediante `formatSitemapDate(article.updatedAt)`.
   - `changefreq`: `'monthly'`
   - `priority`: `0.7`

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
