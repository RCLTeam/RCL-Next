# Persistencia y Consultas de Datos: Dynamic Sitemap XML

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Contratos y Tipos ➡️](contracts.md)

---

## 1. Visión General de la Capa de Persistencia

La capa de persistencia del módulo sitemap reside en `apps/api/src/modules/sitemap/persistence/`. Su responsabilidad exclusiva es suministrar los identificadores únicos y las marcas de tiempo de última actualización de las entidades dinámicas del dominio mediante consultas optimizadas de solo lectura.

Siguiendo el principio de inversión de dependencias, la lógica de negocio depende únicamente de la interfaz abstracta `SitemapRepository` (`sitemap.repository.ts`), desacoplada de la implementación concreta `PostgresSitemapRepository` (`postgres-sitemap.repository.ts`), la cual interactúa con PostgreSQL a través de **Drizzle ORM**.

---

## 2. Contrato de la Interfaz (`sitemap.repository.ts`)

La interfaz define un contrato mínimo y segregado compuesto por tres métodos asíncronos:

```typescript
// apps/api/src/modules/sitemap/persistence/sitemap.repository.ts:1-12
import type {
  SitemapArticleItem,
  SitemapPlayerItem,
  SitemapTeamItem
} from '../types/sitemap.types.js';

export interface SitemapRepository {
  getTeams(): Promise<SitemapTeamItem[]>;
  getPlayers(): Promise<SitemapPlayerItem[]>;
  getArticles(): Promise<SitemapArticleItem[]>;
}
```

Cada método resuelve a una colección fuertemente tipada que encapsula únicamente el identificador UUID (`id`) y el objeto temporal (`updatedAt: Date`).

---

## 3. Implementación Relacional con Drizzle ORM (`PostgresSitemapRepository`)

La clase `PostgresSitemapRepository` implementa la interfaz sobre una conexión a PostgreSQL (compatible tanto con el cliente nativo `postgres` en entornos de producción como con `pglite` en entornos de prueba):

```typescript
// apps/api/src/modules/sitemap/persistence/postgres-sitemap.repository.ts:12-16
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export class PostgresSitemapRepository implements SitemapRepository {
  constructor(private readonly db: Database) {}
  ...
}
```

### 3.1 Consulta de Equipos (`getTeams`)

Recupera únicamente las escuadras marcadas como activas en la competición:

```typescript
// apps/api/src/modules/sitemap/persistence/postgres-sitemap.repository.ts:17-34
async getTeams(): Promise<SitemapTeamItem[]> {
  const rows = await this.db
    .select({
      id: teams.id,
      updatedAt: teams.updatedAt,
      createdAt: teams.createdAt
    })
    .from(teams)
    .where(eq(teams.isActive, true));

  return rows.map((row) => {
    const date = row.updatedAt ?? row.createdAt;
    return {
      id: row.id,
      updatedAt: date instanceof Date ? date : new Date(date)
    };
  });
}
```

#### Decisiones de Diseño:
- **Filtro de Estado Activo:** La cláusula `where(eq(teams.isActive, true))` excluye equipos dados de baja o en estado inactivo, previniendo la indexación de páginas vacías o sin plantilla.
- **Proyección Mínima:** Solo se seleccionan `id`, `updatedAt` y `createdAt`. Se descartan columnas pesadas como `logoUrl`, `bio` o claves foráneas relacionales.
- **Respaldo de Fecha:** Si la columna `updatedAt` resultara nula (por ejemplo, en inserciones directas sin marca de modificación), se utiliza `createdAt` como fecha alternativa de respaldo antes de normalizarla a un objeto `Date`.

### 3.2 Consulta de Jugadores (`getPlayers`)

Extrae todos los jugadores registrados en el ecosistema de la liga:

```typescript
// apps/api/src/modules/sitemap/persistence/postgres-sitemap.repository.ts:36-52
async getPlayers(): Promise<SitemapPlayerItem[]> {
  const rows = await this.db
    .select({
      id: players.id,
      updatedAt: players.updatedAt,
      createdAt: players.createdAt
    })
    .from(players);

  return rows.map((row) => {
    const date = row.updatedAt ?? row.createdAt;
    return {
      id: row.id,
      updatedAt: date instanceof Date ? date : new Date(date)
    };
  });
}
```

#### Decisiones de Diseño:
- **Protección de Privacidad:** La consulta proyecta exclusivamente `id` y marcas temporales, garantizando que identificadores sensibles como `puuid`, `discordUserId` o estadísticas internas jamás se carguen en memoria para este flujo.
- **Normalización Temporal:** Aplica el mismo mecanismo de coalescencia `updatedAt ?? createdAt` garantizando un objeto `Date` válido para el formateador ISO.

### 3.3 Consulta de Artículos Editoriales (`getArticles`)

Recupera las noticias y reportajes que han sido efectivamente publicados:

```typescript
// apps/api/src/modules/sitemap/persistence/postgres-sitemap.repository.ts:54-67
async getArticles(): Promise<SitemapArticleItem[]> {
  const rows = await this.db
    .select({
      id: editorialArticles.id,
      updatedAt: editorialArticles.updatedAt
    })
    .from(editorialArticles)
    .where(eq(editorialArticles.published, true));

  return rows.map((row) => ({
    id: row.id,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)
  }));
}
```

#### Decisiones de Diseño:
- **Exclusión de Borradores:** La cláusula `where(eq(editorialArticles.published, true))` impide de forma terminante que artículos en fase de borrador aparezcan en el sitemap público.
- **Ahorro de Ancho de Banda y Memoria:** La tabla `editorial_articles` almacena campos extensos de texto como `body` (cuerpo Markdown/HTML) y `coverUrl`. Al seleccionar únicamente `id` y `updatedAt`, el consumo de memoria heap en el proceso Node.js se reduce prácticamente a cero.

---

## 4. Eficiencia de I/O y Concurrencia de Consultas

1. **Ejecución Paralela con `Promise.all`:** En el servicio orquestador (`sitemap.service.ts:98-102`), las llamadas a `getTeams()`, `getPlayers()` y `getArticles()` se despachan en paralelo. La latencia total del acceso a datos corresponde al tiempo de la consulta más lenta, en lugar de acumular la suma secuencial de las tres.
2. **Uso de Índices de Base de Datos:**
   - La tabla `editorial_articles` cuenta con el índice compuesto `editorial_home_idx` sobre `(published, show_on_home, home_order)` (`schema.ts:687`), lo que permite a PostgreSQL resolver rápidamente el filtro `published = true`.
   - Las consultas a `teams` y `players` operan sobre claves primarias `id` indexadas por defecto como índices B-tree únicos.
3. **Frecuencia Reducida por Capa de Caché:** Gracias al TTL de 12 horas y la deduplicación de peticiones concurrentes, la tasa de ejecución de estas consultas sobre PostgreSQL es despreciable (máximo 2 veces por día por réplica del backend en condiciones operativas normales).
