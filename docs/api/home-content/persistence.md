# Persistencia y Modelo Relacional: Editorial Home Content

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Validación ➡️](validation.md)

---

## 1. Visión General de Persistencia

El acceso a la base de datos PostgreSQL se implementa en la clase `PostgresHomeContentRepository` (`apps/api/src/modules/home-content/postgres-home-content.repository.ts:59-300`), implementando la interfaz abstracta `HomeContentRepository` (`home-content.repository.ts:1-19`) mediante consultas fuertemente tipadas con **Drizzle ORM**.

El repositorio administra dos tablas principales:
1. `editorial_articles`: Almacena el contenido editorial, metadatos de autoría, ordenación para la página de inicio y marcas de tiempo de publicación.
2. `home_weekly_teams`: Almacena la selección del quinteto ideal de cada jornada para cada división, con una estructura desnormalizada en formato JSONB para la lista de 5 jugadores.

---

## 2. Definición del Esquema Relacional (`packages/database/src/schema.ts`)

### 2.1 Tabla `editorial_articles` (`schema.ts:668-692`)

```typescript
// packages/database/src/schema.ts:668-686
export const editorialArticles = pgTable(
  'editorial_articles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 180 }).notNull(),
    excerpt: varchar('excerpt', { length: 500 }).notNull(),
    body: text('body').notNull(),
    kind: varchar('kind', { length: 20 }).$type<'noticia' | 'reportaje' | 'entrevista' | 'otro'>().notNull(),
    author: varchar('author', { length: 120 }).notNull(),
    coverUrl: text('cover_url').notNull().default(''),
    coverAlt: varchar('cover_alt', { length: 240 }).notNull().default(''),
    published: boolean('published').notNull().default(false),
    showOnHome: boolean('show_on_home').notNull().default(false),
    homeOrder: integer('home_order').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('editorial_home_idx').on(table.published, table.showOnHome, table.homeOrder),
    check('editorial_kind_check', sql`kind in ('noticia', 'reportaje', 'entrevista', 'otro')`),
    check('editorial_order_check', sql`home_order >= 0`)
  ]
);
```

#### Restricciones e Índices:
- **`editorial_home_idx`:** Índice B-tree compuesto sobre `(published, show_on_home, home_order)` optimizado para la consulta de la página de inicio (`WHERE published = true AND show_on_home = true ORDER BY home_order`).
- **`editorial_kind_check`:** Restricción CHECK que valida a nivel de motor SQL que el tipo pertenezca a los 4 géneros editoriales permitidos.
- **`editorial_order_check`:** Restricción CHECK que impide valores negativos en `home_order`.

---

### 2.2 Tabla `home_weekly_teams` (`schema.ts:633-666`)

```typescript
// packages/database/src/schema.ts:633-666
export const homeWeeklyTeams = pgTable(
  'home_weekly_teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roundId: smallint('round_id'),
    divisionId: uuid('division_id')
      .notNull()
      .references(() => seasonsDivisions.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 120 }).notNull(),
    published: boolean('published').notNull().default(false),
    players: jsonb('players')
      .notNull()
      .$type<
        Array<{
          role: 'top' | 'jungle' | 'mid' | 'adc' | 'support';
          name: string;
          team: string;
          imageUrl: string;
          playerId?: string;
          teamId?: string;
          champions?: string[];
        }>
      >(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique('home_weekly_teams_division_round_key').on(table.divisionId, table.roundId),
    foreignKey({
      columns: [table.roundId, table.divisionId],
      foreignColumns: [rounds.id, rounds.idSeasonDivision],
      name: 'home_weekly_teams_round_fkey'
    }).onDelete('cascade')
  ]
);
```

#### Restricciones Relacionales:
- **`home_weekly_teams_division_id_fkey`:** Clave foránea que referencia a `seasons_divisions.id` con eliminación en cascada (`ON DELETE CASCADE`).
- **`home_weekly_teams_round_fkey`:** Clave foránea compuesta que vincula `(round_id, division_id)` con la clave primaria de `rounds(id, id_season_division)` con `ON DELETE CASCADE`. Garantiza que no pueda crearse un quinteto para una jornada que no pertenezca a esa división.
- **`home_weekly_teams_division_round_key`:** Restricción de unicidad compuesta sobre `(division_id, round_id)`. Impide la existencia de más de un quinteto por jornada y división, habilitando la semántica de upsert mediante `ON CONFLICT DO UPDATE`.

---

## 3. Comportamiento Crítico: Exclusión de Triggers PL/pgSQL

En `packages/database/drizzle/0000_initial_schema.sql:386-398`, se instala el trigger de actualización automática de marcas de tiempo:

```sql
-- 0000_initial_schema.sql:386-398
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'seasons', 'divisions', 'seasons_divisions', 'discord_users', 'teams', 'players', 'team_memberships',
    'roster_movements', 'rounds', 'matches', 'match_games', 'player_game_info', 'player_game_stats',
    'player_game_runes', 'player_game_build', 'predictions',
    'audit_logs'
  ] LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name);
  END LOOP;
END;
$$;
```

### Gestión Manual de Fechas de Actualización
- **Las tablas `editorial_articles` y `home_weekly_teams` NO forman parte del array del trigger.**
- **Mecanismo Real:** La actualización de `updated_at` debe ser suministrada obligatoriamente en TypeScript en cada operación de escritura:
  - En `saveArticle`: `updatedAt: new Date()` (`postgres-home-content.repository.ts:109`).
  - En `saveWeeklyTeam`: `updatedAt: new Date()` (`postgres-home-content.repository.ts:279`).
- **Consecuencia de Integridad:** Si una herramienta administrativa externa o script de mantenimiento ejecuta un `UPDATE editorial_articles SET title = ...` directamente en SQL sin especificar `updated_at = NOW()`, la marca de tiempo quedará congelada en su valor anterior.

---

## 4. Transacciones ACID, Bloqueos y Auditoría

### 4.1 Bloqueo Pesimista en Actualización de Artículos
En `postgres-home-content.repository.ts:98-105`, la actualización de artículos adquiere un bloqueo exclusivo por fila mediante `for('update')`:

```typescript
// postgres-home-content.repository.ts:98-105
return this.db.transaction(async (tx) => {
  const [before] = id
    ? await tx
        .select()
        .from(editorialArticles)
        .where(eq(editorialArticles.id, id))
        .for('update')
    : [];
  if (id && !before) throw notFound('Article');
  // ...
```
Esto previene condiciones de carrera en modificaciones concurrentes y asegura que el registro de auditoría (`audit_logs`) capture con fidelidad el estado previo (`before`) y posterior (`after`).

### 4.2 Registro en Tabla `audit_logs`
Toda mutación administrativa persiste una traza inmutable en `audit_logs`:
- **`editorial.create`:** Registra el nuevo artículo serializado (`postgres-home-content.repository.ts:123`).
- **`editorial.update`:** Registra `before` y `after` en formato JSONB (`postgres-home-content.repository.ts:123-125`).
- **`editorial.delete`:** Registra el artículo eliminado completo bajo `before` (`postgres-home-content.repository.ts:137-142`).
- **`weekly-team.update`:** Registra la división, jornada y jugadores previos y posteriores (`postgres-home-content.repository.ts:289-296`).

### 4.3 Bloqueo Global de Tabla en Recolección de Imágenes
En `postgres-home-content.repository.ts:64`, la limpieza de imágenes ejecuta:

```sql
LOCK TABLE editorial_articles IN SHARE ROW EXCLUSIVE MODE;
```
Este comando adquiere un bloqueo de nivel tabla que impide transacciones concurrentes de escritura en `editorial_articles` mientras se escanea el cuerpo de todos los artículos para determinar si una imagen está huérfana.

---

## 5. Advertencia de Rendimiento: Consulta N+1 en `listWeeklyTeams`

En `postgres-home-content.repository.ts:207-223`, la recuperación de selecciones semanales adolece de un patrón de consulta N+1 medido:

```typescript
// postgres-home-content.repository.ts:207-223
return Promise.all(
  rows.map(async (row) => {
    const team = teamDto(row);
    const candidates =
      row.roundId === null ? [] : await this.weeklyCandidates(divisionId, row.roundId);
    return {
      ...team,
      players: team.players.map((player) => ({
        ...player,
        champions:
          candidates.find(
            (item) => item.playerId === player.playerId && item.teamId === player.teamId
          )?.champions ?? []
      }))
    };
  })
);
```

### Impacto Medido:
1. Se recuperan las $N$ filas de quintetos de la división (`SELECT * FROM home_weekly_teams WHERE division_id = ...`).
2. Por cada fila recuperada, se invoca de forma independiente `this.weeklyCandidates(divisionId, row.roundId)`.
3. Cada invocación a `weeklyCandidates` ejecuta una consulta relacional pesada con 4 `INNER JOIN` (`playerGameInfo` -> `players` -> `teams` -> `matchGames` -> `matches`).
4. **Carga Total:** Para una división con 10 jornadas disputadas, una llamada a `GET /weekly-teams/:id/rounds` genera **1 consulta inicial + 10 consultas complejas secundarias = 11 consultas SQL en cascada**.
5. **Mitigación:** En entornos de alta concurrencia, esta información debe ser precargada mediante una única consulta agregada o almacenada directamente en la columna JSONB `players` en el momento del guardado.
