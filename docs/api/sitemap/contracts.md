# Contratos de Interfaz y Tipos de Dominio: Dynamic Sitemap XML

[⬅️ Volver a Persistencia](persistence.md) | [Volver al Índice de Sitemap API ⬆️](README.md)

---

## 1. Visión General de Contratos

El módulo sitemap define sus tipos y estructuras de datos en `apps/api/src/modules/sitemap/types/sitemap.types.ts`. Estos contratos modelan las especificaciones del estándar oficial **Sitemaps XML 0.9** y establecen los esquemas mínimos de intercambio entre la base de datos relacional y el generador XML.

La totalidad del código opera con tipado estricto en TypeScript, sin recurrir a tipos dinámicos (`any`) ni aserciones inseguras.

---

## 2. Tipos de Dominio (`sitemap.types.ts`)

### 2.1 Frecuencia de Modificación (`SitemapChangeFrequency`)

Define las frecuencias válidas reconocidas por los analizadores de los motores de búsqueda:

```typescript
// apps/api/src/modules/sitemap/types/sitemap.types.ts:1-8
export type SitemapChangeFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';
```

### 2.2 Entradas de URL en el Mapa del Sitio (`SitemapUrlEntry` y `SitemapEntry`)

Estructura de datos intermedia que representa un nodo `<url>` individual antes de ser serializado a XML:

```typescript
// apps/api/src/modules/sitemap/types/sitemap.types.ts:10-17
export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: SitemapChangeFrequency;
  priority?: number;
}

export type SitemapEntry = SitemapUrlEntry;
```

#### Definición de Campos:
- **`loc` (`string`, obligatorio):** Dirección URL canónica absoluta del recurso indexable (por ejemplo, `https://rebelcrownlegacy.es/calendario` o `https://rebelcrownlegacy.es/equipos/lobos-demo`).
- **`lastmod` (`string`, opcional):** Marca de fecha en formato W3C Datetime (`YYYY-MM-DD`) que indica la última modificación del recurso.
- **`changefreq` (`SitemapChangeFrequency`, opcional):** Frecuencia con la que es probable que el contenido de la página cambie (`'daily'`, `'weekly'`, `'monthly'`, etc.).
- **`priority` (`number`, opcional):** Prioridad relativa de la URL con respecto a otras páginas del sitio, en el rango numérico de `0.0` a `1.0`.

### 2.3 Modelos Ligeros de Persistencia

Modelan los registros proyectados desde PostgreSQL por `SitemapRepository`:

```typescript
// apps/api/src/modules/sitemap/types/sitemap.types.ts:19-42
/**
 * Every team of the directory (active or not): slugs are disambiguated against the whole
 * directory, exactly as the competition API does, and only active teams are published.
 */
export interface SitemapTeamItem {
  id: string;
  name: string;
  seasonName: string;
  divisionName: string;
  isActive: boolean;
  updatedAt: Date;
}

export interface SitemapPlayerItem {
  id: string;
  gameName: string;
  riotTag: string | null;
  updatedAt: Date;
}

export interface SitemapArticleItem {
  id: string;
  updatedAt: Date;
}
```

- **`SitemapTeamItem`:** `name`, `seasonName` y `divisionName` son la entrada de `teamProfileSlugs`; `isActive` decide si el equipo se publica.
- **`SitemapPlayerItem`:** `gameName` y `riotTag` son la entrada de `playerProfileSlugs`.
- **`SitemapArticleItem`:** Solo el identificador, porque la web enlaza los artículos como `/editorial/:id`.

### 2.4 Configuración del Módulo (`SitemapConfig`)

Opciones de configuración desacopladas para el módulo:

```typescript
// apps/api/src/modules/sitemap/types/sitemap.types.ts:44-47
export interface SitemapConfig {
  baseUrl?: string;
  cacheTtlMs?: number;
}
```

---

## 3. Contratos de la Capa de Procesamiento (`sitemap.service.ts`)

En `apps/api/src/modules/sitemap/processing/sitemap.service.ts`, se definen contratos específicos para la orquestación interna:

### 3.1 Opciones del Servicio (`SitemapServiceOptions`)

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:10-13
export interface SitemapServiceOptions {
  baseUrl?: string;
  cacheTtlMs?: number;
}
```

Permite inyectar en el constructor de `SitemapService` un dominio base personalizado o ajustar la duración de la caché en memoria para entornos de prueba o staging.

### 3.2 Rutas Estáticas (`SITEMAP_STATIC_PATHS` y `StaticRouteSettings`)

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:15-18
interface StaticRouteSettings {
  priority: number;
  changefreq: SitemapChangeFrequency;
}
```

`SITEMAP_STATIC_PATHS` (exportada, `sitemap.service.ts:39-41`) es la lista de rutas públicas derivada de `pageMetadata` de `@rcl/contracts`. `StaticRouteSettings` solo describe la prioridad y la frecuencia de cada ruta en `STATIC_ROUTE_SETTINGS` (ver [processing.md](processing.md#31-rutas-estáticas-de-la-plataforma-sitemap_static_paths)).

### 3.3 Funciones de Slug Compartidas (`profile-slugs.ts`)

```typescript
// apps/api/src/modules/competition/profile-slugs.ts:62-85
export function teamProfileSlugs(
  teams: { id: string; name: string; seasonName: string; divisionName: string }[]
): Map<string, string>;
export function playerProfileSlugs(
  players: { id: string; gameName: string; riotTag: string | null }[]
): Map<string, string>;
```

Devuelven el mapa `id → slug` que usan tanto `CompetitionService` (campo `slug` de la API) como `SitemapService`.

---

## 4. Esquema de Serialización XML (Sitemaps 0.9)

La salida serializada se ajusta al esquema oficial de Sitemaps 0.9 (`http://www.sitemaps.org/schemas/sitemap/0.9`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://rebelcrownlegacy.es/ejemplo</loc>
    <lastmod>2026-10-03</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
```

### Reglas de Validación del Esquema:
1. **Espacio de Nombres Obligatorio:** El elemento raíz debe incluir el atributo `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`.
2. **Escapado de Entidades:** Caracteres como `&`, `<`, `>`, `"`, `'` dentro de `<loc>` se sustituyen por entidades canónicas XML (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`).
3. **Formato Numérico de Prioridad:** La etiqueta `<priority>` siempre se formatea con un punto decimal fijo (`toFixed(1)`), por ejemplo `1.0`, `0.9`, `0.8`, `0.7`, `0.6`.
