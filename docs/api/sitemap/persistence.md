# Persistencia y Consultas de Datos: Dynamic Sitemap XML

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Contratos y Tipos ➡️](contracts.md)

---

## 1. Visión General de la Capa de Persistencia

La capa de persistencia del módulo sitemap reside en `apps/api/src/modules/sitemap/persistence/`. Su responsabilidad exclusiva es suministrar, mediante consultas de solo lectura, los identificadores, los campos necesarios para calcular los slugs públicos y las marcas de tiempo de última actualización de las entidades dinámicas del dominio.

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

Cada método resuelve a una colección tipada con el identificador UUID (`id`), la fecha `updatedAt: Date` y, para equipos y jugadores, los campos de los que depende su slug (ver [contracts.md](contracts.md#23-modelos-ligeros-de-persistencia)).

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

Recupera el directorio completo de equipos con su temporada y división, la misma proyección que `PostgresCompetitionRepository.teamDirectory()`:

```typescript
// apps/api/src/modules/sitemap/persistence/postgres-sitemap.repository.ts:17-42
async getTeams(): Promise<SitemapTeamItem[]> {
  const rows = await this.db
    .select({
      id: teams.id,
      name: teams.name,
      seasonName: seasonsDivisions.seasonName,
      divisionName: seasonsDivisions.divisionName,
      isActive: teams.isActive,
      updatedAt: teams.updatedAt,
      createdAt: teams.createdAt
    })
    .from(teams)
    .innerJoin(seasonsDivisions, eq(teams.seasonDivisionId, seasonsDivisions.id));

  return rows.map((row) => {
    const date = row.updatedAt ?? row.createdAt;
    return {
      id: row.id,
      name: row.name,
      seasonName: row.seasonName,
      divisionName: row.divisionName,
      isActive: row.isActive,
      updatedAt: date instanceof Date ? date : new Date(date)
    };
  });
}
```

#### Decisiones de Diseño:
- **Directorio completo, publicación filtrada:** `profileSlugs` desambigua los nombres repetidos sobre todo el directorio, también con equipos inactivos. Para obtener exactamente los slugs de la API, la consulta no filtra por `isActive`; es `SitemapService` quien publica solo los activos.
- **`innerJoin` con `seasons_divisions`:** Aporta `seasonName` y `divisionName`, que forman el contexto de desambiguación (`temporada división`). `teams.season_division_id` es `NOT NULL` con clave foránea, así que el join no descarta equipos.
- **Respaldo de Fecha:** Si `updatedAt` resultara nula, se utiliza `createdAt` antes de normalizarla a un objeto `Date`.

### 3.2 Consulta de Jugadores (`getPlayers`)

Extrae todos los jugadores registrados, con los campos que forman su slug:

```typescript
// apps/api/src/modules/sitemap/persistence/postgres-sitemap.repository.ts:44-64
async getPlayers(): Promise<SitemapPlayerItem[]> {
  const rows = await this.db
    .select({
      id: players.id,
      gameName: players.gameName,
      riotTag: players.riotTag,
      updatedAt: players.updatedAt,
      createdAt: players.createdAt
    })
    .from(players);

  return rows.map((row) => {
    const date = row.updatedAt ?? row.createdAt;
    return {
      id: row.id,
      gameName: row.gameName,
      riotTag: row.riotTag,
      updatedAt: date instanceof Date ? date : new Date(date)
    };
  });
}
```

#### Decisiones de Diseño:
- **Campos del slug:** `gameName` y `riotTag` son los mismos que usa `CompetitionService` para el slug del jugador (`gameName riotTag`).
- **Protección de Privacidad:** No se cargan identificadores sensibles como `puuid` o `discordUserId`.
- **Normalización Temporal:** Aplica la misma coalescencia `updatedAt ?? createdAt`.

### 3.3 Consulta de Artículos Editoriales (`getArticles`)

Recupera las noticias y reportajes que han sido efectivamente publicados:

```typescript
// apps/api/src/modules/sitemap/persistence/postgres-sitemap.repository.ts:66-79
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

1. **Ejecución Paralela con `Promise.all`:** En el servicio orquestador (`sitemap.service.ts:118-122`), las llamadas a `getTeams()`, `getPlayers()` y `getArticles()` se despachan en paralelo. La latencia total del acceso a datos corresponde al tiempo de la consulta más lenta, en lugar de acumular la suma secuencial de las tres.
2. **Uso de Índices de Base de Datos:**
   - La tabla `editorial_articles` cuenta con el índice compuesto `editorial_home_idx` sobre `(published, show_on_home, home_order)` (`schema.ts:687`), lo que permite a PostgreSQL resolver rápidamente el filtro `published = true`.
   - La consulta de `teams` recorre la tabla completa y la une con `seasons_divisions` por su clave primaria; `players` se lee completa. Ambas tablas tienen el tamaño de una liga (decenas o cientos de filas).
3. **Frecuencia Reducida por Capa de Caché:** Con la deduplicación de peticiones concurrentes, las consultas se ejecutan como mucho una vez por hora (TTL de respaldo) más una vez tras cada escritura de administración correcta, y solo cuando alguien pide el sitemap.
