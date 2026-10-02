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

---

### 4.3 Bloqueo de Tabla en Recolección de Imágenes Huérfanas (`removeUnusedImages`)

En `postgres-home-content.repository.ts:61-73`, la purga de imágenes no referenciadas ejecuta un bloqueo transaccional de tabla:

```typescript
// apps/api/src/modules/home-content/postgres-home-content.repository.ts:61-73
async removeUnusedImages(urls: string[], remove: (url: string) => Promise<void>) {
  if (!urls.length) return;
  await this.db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE editorial_articles IN SHARE ROW EXCLUSIVE MODE`);
    const articles = await tx
      .select({ coverUrl: editorialArticles.coverUrl, body: editorialArticles.body })
      .from(editorialArticles);
    for (const url of new Set(urls)) {
      if (!articles.some((article) => article.coverUrl === url || article.body.includes(url)))
        await remove(url);
    }
  });
}
```

#### Fundamento del Modo `SHARE ROW EXCLUSIVE MODE`:
1. **Compatibilidad con Lecturas Concurrentes:**
   En la jerarquía de bloqueos de PostgreSQL, el modo `SHARE ROW EXCLUSIVE` es compatible con el bloqueo `ACCESS SHARE`. Esto significa que las peticiones de lectura del público general (`SELECT * FROM editorial_articles`) continúan ejecutándose concurrentemente sin sufrir bloqueos ni latencia durante la recolección de imágenes.
2. **Exclusión de Escrituras Concurrentes:**
   El modo `SHARE ROW EXCLUSIVE` entra en conflicto directo con los modos `ROW EXCLUSIVE` (adquiridos automáticamente por sentencias `INSERT`, `UPDATE` y `DELETE`), `SHARE`, `SHARE ROW EXCLUSIVE`, `EXCLUSIVE` y `ACCESS EXCLUSIVE`.
3. **Prevención de Condiciones de Carrera:**
   Si un redactor estuviera guardando o actualizando un artículo que hace referencia a una de las imágenes candidatas en el mismo instante en que `removeUnusedImages` inspecciona la tabla, la ausencia de este bloqueo permitiría que el lector de limpieza leyera la tabla antes del `COMMIT` del redactor, concluyera erróneamente que la imagen está huérfana y eliminara el archivo físico del disco. Posteriormente, el artículo se guardaría con éxito, pero quedaría permanentemente roto con un error 404 al intentar cargar la imagen.
   Al imponer `SHARE ROW EXCLUSIVE MODE`, cualquier transacción de escritura sobre `editorial_articles` queda en espera hasta que la verificación y las eliminaciones físicas del disco hayan concluido, garantizando integridad referencial estricta entre el sistema de archivos y la base de datos.

---

## 5. Almacén Físico de Imágenes y Recolector Periódico en Servidor

### 5.1 Almacén Físico `EditorialImageStore` (`apps/api/src/modules/home-content/editorial-image.store.ts:6-63`)

La gestión de ficheros estáticos en disco opera de forma local y autónoma:

```typescript
// apps/api/src/modules/home-content/editorial-image.store.ts:6-22
export class EditorialImageStore {
  private readonly directory: string;
  constructor(directory = process.env.EDITORIAL_IMAGE_DIR ?? 'data/editorial-images') {
    this.directory = resolve(directory);
  }
  path(name: string) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(name)) throw notFound('Image');
    return resolve(this.directory, name);
  }
  async remove(url: string) {
    const name = url.replace('/api/v1/home-content/images/', '');
    try {
      await unlink(this.path(name));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  // ...
```

#### Características del Almacén:
- **Directorio Configurable:** Resuelve `process.env.EDITORIAL_IMAGE_DIR ?? 'data/editorial-images'` de forma absoluta con `path.resolve` (`editorial-image.store.ts:8-10`).
- **Nomenclatura Segura con UUID v4:** Genera nombres aleatorios mediante `randomUUID()` (`${randomUUID()}.${extension}`, línea 58), previniendo colisiones de nombres y ataques de enumeración.
- **Protección contra Path Traversal:** El método `path(name)` valida el identificador mediante la expresión regular estricta `/^[a-f0-9-]{36}\.(png|jpg|webp)$/`. Cualquier valor que intente escapar de la ruta (como `../`) arroja inmediatamente una excepción `notFound('Image')` (HTTP 404).
- **Validación de Bytes Mágicos Binarios en `save` (`editorial-image.store.ts:44-62`):**
  - **PNG:** Verifica que los primeros 8 bytes coincidan con la firma hexadecimal `89504e470d0a1a0a`.
  - **JPEG:** Verifica que los primeros 3 bytes coincidan con `ffd8ff`.
  - **WebP:** Verifica que los bytes 0-4 correspondan a `RIFF` y los bytes 8-12 a `WEBP` en codificación ASCII.
  - Rechaza cualquier archivo que no coincida con su tipo MIME o supere los 5 MiB con `AppError(422, 'INVALID_IMAGE')`.
  - Escribe el archivo con la bandera de creación exclusiva `{ flag: 'wx' }` (`editorial-image.store.ts:60`).
- **Eliminación Idempotente (`remove`):** Al invocar `unlink(this.path(name))`, intercepta el error `ENOENT` (archivo no encontrado en disco) y lo silencia deliberadamente. Esto hace que las operaciones de limpieza sean idempotentes y no fallen si dos procesos intentan purgar la misma URL o si el archivo fue retirado previamente.
- **Detección de Subidas Caducadas (`expiredUploads`, líneas 23-43):**
  Inspecciona los ficheros en disco leyendo `stat.mtimeMs`. Si `now - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000` (7 días de gracia), incluye la URL en el listado de candidatas para el recolector de basura.

---

### 5.2 Recolector Periódico Desacoplado (*Scheduled Sweeper*) en `server.ts` (`apps/api/src/server.ts:101-113, 126-148`)

Para prevenir la acumulación de imágenes huérfanas derivadas de desconexiones de red del cliente o cierres de pestaña sin descarte, el proceso del servidor ejecuta un recolector en segundo plano:

```typescript
// apps/api/src/server.ts:101-113
const homeContent = new HomeContentService(new PostgresHomeContentRepository(connection.db));
let imageCleanup: Promise<void> | undefined;
function cleanupImages() {
  if (imageCleanup) return;
  imageCleanup = homeContent
    .cleanupExpiredImages()
    .catch((error: unknown) => console.error('Editorial image cleanup failed:', error))
    .finally(() => {
      imageCleanup = undefined;
    });
}
const imageCleanupTimer = setInterval(cleanupImages, 60 * 60 * 1000).unref();
cleanupImages();
```

#### Mecanismos de Orquestación del Sweeper:
1. **Mutex de Limpieza en Memoria (`imageCleanup`):**
   La variable `imageCleanup` almacena la promesa de la tarea en curso. Si un ciclo de limpieza tarda más de lo previsto debido a I/O lento o bloqueos de tabla en la base de datos, las llamadas subsiguientes a `cleanupImages()` retornan de inmediato (`if (imageCleanup) return;`), evitando la concurrencia entre barridos y la contención de recursos.
2. **Intervalo Desacoplado de 1 Hora:**
   El recolector se programa cada 60 minutos (`60 * 60 * 1000`). La invocación a `.unref()` marca el temporizador como desreferenciado en el bucle de eventos de Node.js, garantizando que no impida la salida natural del proceso si todos los demás manejadores se cierran.
3. **Período de Gracia de 7 Días (TTL):**
   El servicio invoca `cleanupExpiredImages()`, el cual solicita a `images.expiredUploads()` las imágenes cuya fecha de modificación supera los 7 días y delega en `removeUnusedImages` para comprobar bajo `LOCK TABLE` que ninguna de ellas esté referenciada antes de borrarlas físicamente.
4. **Ejecución Inmediata en Arranque:**
   Al iniciar el servidor, se invoca `cleanupImages()` de forma directa (`server.ts:113`), procesando cualquier residuo caducado acumulado durante períodos de inactividad o reinicios del backend.
5. **Apagado Ordenado (*Graceful Shutdown*, `server.ts:126-145`):**
   ```typescript
   // apps/api/src/server.ts:126-145
   let closing = false;
   function shutdown() {
     if (closing) return;
     closing = true;
     clearInterval(imageCleanupTimer);
     const timeout = setTimeout(() => process.exit(1), 10000).unref();
     roflUploadGateway.close(() => {
       server.close(async () => {
         try {
           suggestionStore.close();
           await bridgeClient.close();
         } catch (err) {
           console.error('Error during Discord bridge/suggestion store shutdown:', err);
         }
         await imageCleanup;
         await connection.close();
         clearTimeout(timeout);
       });
     });
   }
   process.on('SIGINT', shutdown);
   process.on('SIGTERM', shutdown);
   ```
   Ante señales de terminación (`SIGINT`, `SIGTERM`):
   - Detiene el temporizador recurrente con `clearInterval(imageCleanupTimer)`.
   - Establece un temporizador límite de seguridad de 10 segundos (`process.exit(1)`) para evitar bloqueos indefinidos.
   - Cierra los adaptadores de red y la pasarela de subidas ROFL.
   - Espera explícitamente a que cualquier tarea de limpieza en vuelo concluya con `await imageCleanup;`.
   - Cierra el pool de conexiones a PostgreSQL (`await connection.close();`).
   - Cancela el temporizador de salida forzada con `clearTimeout(timeout)`.

---

## 6. Advertencia de Rendimiento: Consulta N+1 en `listWeeklyTeams`

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
