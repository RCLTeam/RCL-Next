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
- **`loc` (`string`, obligatorio):** Dirección URL canónica absoluta del recurso indexable (por ejemplo, `https://rebelcrownlegacy.es/calendario` o `https://rebelcrownlegacy.es/equipos/10000000-0000-4000-8000-000000000001`).
- **`lastmod` (`string`, opcional):** Marca de fecha en formato W3C Datetime (`YYYY-MM-DD`) que indica la última modificación del recurso.
- **`changefreq` (`SitemapChangeFrequency`, opcional):** Frecuencia con la que es probable que el contenido de la página cambie (`'daily'`, `'weekly'`, `'monthly'`, etc.).
- **`priority` (`number`, opcional):** Prioridad relativa de la URL con respecto a otras páginas del sitio, en el rango numérico de `0.0` a `1.0`.

### 2.3 Modelos Ligeros de Persistencia

Modelan los registros proyectados desde PostgreSQL por `SitemapRepository`:

```typescript
// apps/api/src/modules/sitemap/types/sitemap.types.ts:19-32
export interface SitemapTeamItem {
  id: string;
  updatedAt: Date;
}

export interface SitemapPlayerItem {
  id: string;
  updatedAt: Date;
}

export interface SitemapArticleItem {
  id: string;
  updatedAt: Date;
}
```

Cada modelo aísla el identificador primario UUID (`id`) y el objeto temporal normalizado (`updatedAt`), eliminando cualquier dependencia de campos innecesarios del esquema de la base de datos.

### 2.4 Configuración del Módulo (`SitemapConfig`)

Opciones de configuración desacopladas para el módulo:

```typescript
// apps/api/src/modules/sitemap/types/sitemap.types.ts:34-37
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
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:7-10
export interface SitemapServiceOptions {
  baseUrl?: string;
  cacheTtlMs?: number;
}
```

Permite inyectar en el constructor de `SitemapService` un dominio base personalizado o ajustar la duración de la caché en memoria para entornos de prueba o staging.

### 3.2 Definición de Rutas Estáticas (`StaticRouteDefinition`)

```typescript
// apps/api/src/modules/sitemap/processing/sitemap.service.ts:12-16
interface StaticRouteDefinition {
  path: string;
  priority: number;
  changefreq: SitemapChangeFrequency;
}
```

Estructura inmutable utilizada internamente por el catálogo `STATIC_ROUTES` para declarar la prioridad y periodicidad de rastreo de las páginas fijas de la plataforma.

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
