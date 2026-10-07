# Lógica de Procesamiento y Algoritmos: Editorial Home Content

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General de la Capa de Procesamiento

La lógica de negocio y transformación de datos del módulo editorial reside en `HomeContentService` (`apps/api/src/modules/home-content/home-content.service.ts`), apoyada por el almacén seguro de archivos binarios `EditorialImageStore` (`editorial-image.store.ts`) y las rutinas de normalización y agregación en memoria implementadas en `PostgresHomeContentRepository` (`postgres-home-content.repository.ts`).

El subsistema no delega la lógica de negocio a la base de datos ni utiliza procedimientos almacenados para las reglas de publicación; todos los flujos operan de forma tipada, validando entradas mediante Zod y ejecutando comprobaciones fail-fast antes de comprometer transacciones en la capa de persistencia.

---

## 2. Ciclo de Vida y Transiciones de Artículos

Un artículo editorial atraviesa dos estados fundamentales controlados por la bandera booleana `published` y la marca de tiempo `publishedAt` (`postgres-home-content.repository.ts:107-111`):

```
                ┌──────────────────────────────────────────────┐
                │                                              │
                ▼                                              │
┌───────────────────────────────┐              ┌───────────────┴───────────────┐
│           Borrador            │  Publicar    │           Publicado           │
│      (published: false)       ├─────────────►│       (published: true)       │
│     publishedAt: null         │              │    publishedAt: Timestamp     │
└───────────────┬───────────────┘              └───────────────────────────────┘
                ▲                                              │
                │                 Despublicar                  │
                └──────────────────────────────────────────────┘
```

### Reglas de Asignación Temporal (`publishedAt`)
En `postgres-home-content.repository.ts:110`, la fecha de publicación se determina de forma determinista evaluando el estado previo del registro (`before`):

```typescript
// postgres-home-content.repository.ts:107-111
const values = {
  ...input,
  updatedAt: new Date(),
  publishedAt: before?.publishedAt ?? (input.published ? new Date() : null)
};
```

1. **Primera Publicación:** Si el artículo carecía de `publishedAt` previo (`null`) y el input actual establece `published: true`, se genera la marca de tiempo del momento exacto de la publicación (`new Date()`).
2. **Edición de Artículo Publicado:** Si un artículo ya publicado se modifica conservando `published: true`, se preserva estrictamente su fecha original (`before?.publishedAt`), impidiendo que correcciones ortográficas o actualizaciones de contenido alteren el orden cronológico original de lectura.
3. **Pase a Borrador (Despublicación):** Si un artículo publicado se conmuta a `published: false`, `publishedAt` pasa a ser `null`, desapareciendo de forma inmediata de las consultas públicas de la página de inicio.
4. **Visibilidad en Inicio (`showOnHome` y `homeOrder`):** La consulta pública de la página de inicio (`postgres-home-content.repository.ts:81`) requiere conjuntamente `published = true AND showOnHome = true`. Los artículos se ordenan ascendentemente por `homeOrder` (permitiendo fijar artículos destacados en posiciones `0, 1, 2...`), luego descendentemente por `publishedAt` y finalmente por `id` como criterio de desempate determinista.

---

## 3. Almacén de Imágenes y Sniffing de Bytes Mágicos

El almacenamiento de recursos gráficos se implementa en `EditorialImageStore` (`editorial-image.store.ts:1-42`). Su diseño garantiza inmunidad absoluta frente a inyecciones de código, secuencias de escape de directorio y archivos con extensiones engañosas.

### 3.1 Directorio y Prevención de Path Traversal
- Las imágenes se persisten en la ruta configurada en la variable de entorno `EDITORIAL_IMAGE_DIR`, con valor por defecto `'data/editorial-images'` (`apps/api/src/config/env.ts:90`, `editorial-image.store.ts:8`). `server.ts` entrega ese valor al almacén; el módulo no lee `process.env`.
- La función de resolución de ruta en disco (`path(name: string)`, líneas 11-14) evalúa el nombre contra la expresión regular:
  ```typescript
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(name)) throw notFound('Image');
  ```
  Cualquier intento de inyectar rutas relativas (`../`), caracteres nulos (`%00`) o nombres no conformes con un UUID v4 canónico arroja inmediatamente una excepción HTTP 404 `notFound('Image')`, abortando el procesamiento antes de interactuar con el sistema de archivos.

### 3.2 Verificación Binaria de Cabeceras (Magic Bytes)
En `editorial-image.store.ts:23-41`, la función `save(buffer, mimeType)` realiza una inspección profunda del contenido binario, rechazando discrepancias entre el encabezado `Content-Type` declarado y los primeros bytes del buffer:

```typescript
// editorial-image.store.ts:23-41
async save(buffer: Buffer, mimeType: string | undefined): Promise<{ url: string }> {
  if (buffer.length > 5 * 1024 * 1024) throw new AppError(413, 'IMAGE_TOO_LARGE');
  const type = (mimeType ?? '').toLowerCase();
  const valid =
    (type === 'image/png' &&
      buffer.length >= 8 &&
      buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') ||
    (type === 'image/jpeg' &&
      buffer.length >= 3 &&
      buffer.subarray(0, 3).toString('hex') === 'ffd8ff') ||
    (type === 'image/webp' &&
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!valid) throw new AppError(422, 'INVALID_IMAGE', 'Upload a PNG, JPEG, or WebP image.');
  // Escritura atómica sin sobrescritura
  const filename = `${randomUUID()}.${type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp'}`;
  await fs.promises.writeFile(path.join(this.directory, filename), buffer, { flag: 'wx' });
  return { url: `/api/v1/home-content/images/${filename}` };
}
```

- **Límite Estricto de Carga:** Archivos de más de `5.242.880` bytes (5 MiB) generan error HTTP 413 `IMAGE_TOO_LARGE`.
- **Firma PNG:** Requiere los 8 bytes hexadecimales `89 50 4E 47 0D 0A 1A 0A`.
- **Firma JPEG:** Requiere los 3 bytes hexadecimales iniciales `FF D8 FF`.
- **Firma WebP:** Requiere la marca contenedor `RIFF` en bytes 0..3 y la marca de formato `WEBP` en bytes 8..11.
- **Escritura Atómica:** El archivo se almacena mediante la bandera de sistema de archivos `'wx'` (`write exclusive`), la cual falla si el archivo ya existiese, previniendo sobreescrituras accidentales en caso de colisión de UUID.

---

## 4. Recolección de Imágenes Huérfanas y Bloqueo de Tabla

Durante la modificación (`PUT /admin/articles/:id`) o eliminación (`DELETE /admin/articles/:id`) de un artículo, pueden quedar archivos de imagen en el disco que ya no son referenciados ni en la portada ni en el cuerpo.

### 4.1 Extracción de Referencias
En `home-content.service.ts:96-103`, el servicio extrae todas las URLs locales presentes en un artículo concatenando `coverUrl` y `body`:

```typescript
// home-content.service.ts:96-102
private imageUrls(article: { coverUrl: string; body: string } | null): string[] {
  if (!article) return [];
  return (
    `${article.coverUrl}\n${article.body}`.match(
      /\/api\/v1\/home-content\/images\/[a-f0-9-]{36}\.(?:png|jpg|webp)/g
    ) ?? []
  );
}
```

### 4.2 Algoritmo de Purga Concurrente
Para evitar condiciones de carrera donde dos administradores editen artículos simultáneamente y uno borre una imagen que el otro acaba de reutilizar, la purga se ejecuta dentro de una transacción ACID con bloqueo de tabla en `postgres-home-content.repository.ts:61-72`:

```typescript
// postgres-home-content.repository.ts:61-72
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

1. **Bloqueo `SHARE ROW EXCLUSIVE`:** Adquiere un bloqueo sobre toda la tabla `editorial_articles`, permitiendo lecturas concurrentes pero serializando cualquier otra mutación o limpieza de imágenes simultánea.
2. **Lectura Completa del Catálogo:** Selecciona todas las portadas y cuerpos de todos los artículos de la base de datos.
3. **Comprobación de Ausencia Total:** Una imagen candidata solo se envía a borrar (`remove(url)`) si **ningún** artículo en la base de datos la referencia ni en `coverUrl` ni en `body`.

---

## 5. Selección y Validación Deportiva del Quinteto Ideal

El subsistema *Team of the Week* (`WeeklyTeamManager`) asigna a los 5 jugadores más destacados de una jornada oficial a sus respectivos roles competitivos.

### 5.1 Normalización de Roles Deportivos
Para tolerar nomenclaturas heterogéneas procedentes de fuentes estadísticas o planillas, la función interna `weeklyRole` (`postgres-home-content.repository.ts:25-47`) mapea múltiples sinónimos a los 5 roles canónicos de League of Legends:

| Entrada Normalizada | Sinónimos Aceptados | Rol Canónico |
|---|---|:---:|
| `top` | `'top'` | `top` |
| `jungle` | `'jungle'`, `'jgl'`, `'jg'` | `jungle` |
| `mid` | `'mid'`, `'middle'` | `mid` |
| `adc` | `'adc'`, `'bot'`, `'bottom'` | `adc` |
| `support` | `'support'`, `'sup'`, `'utility'` | `support` |

### 5.2 Consulta y Agregación de Candidatos (`weeklyCandidates`)
Para garantizar que solo se pueda elegir a jugadores que realmente participaron en esa jornada, `postgres-home-content.repository.ts:147-193` ejecuta una consulta relacional con 4 uniones internas:

```sql
SELECT player_game_info.*, players.*, teams.*, match_games.*, matches.*
FROM player_game_info
INNER JOIN players ON players.id = player_game_info.player_id
INNER JOIN teams ON teams.id = player_game_info.team_id
INNER JOIN match_games ON match_games.id = player_game_info.game_id
INNER JOIN matches ON matches.id = match_games.match_id
WHERE matches.id_season_division = :divisionId AND matches.id_round = :roundId
```

Los registros devueltos se agrupan en memoria mediante la clave compuesta `${row.teamId}:${row.playerId}`:
- Se agregan todos los campeones jugados por el jugador durante la jornada en un array `champions: string[]`.
- Se agregan todos los roles en los que compitió en un array `roles: WeeklyPlayer['role'][]`.

### 5.3 Validaciones de Integridad en `saveWeeklyTeam`
Al recibir la propuesta de quinteto (`PUT /admin/weekly-teams/:id`), `postgres-home-content.repository.ts:245-273` aplica tres filtros obligatorios:

1. **Elegibilidad Fáctica:** El jugador (`playerId` y `teamId`) debe estar presente en el conjunto de candidatos de esa jornada específica. Si no jugó en esa jornada, se rechaza.
2. **Coherencia de Rol:** El rol asignado en el quinteto (`player.role`) debe estar contenido en los roles que el jugador desempeñó efectivamente durante la jornada (`candidate.roles.includes(player.role)`). De lo contrario, arroja `AppError(422, 'INVALID_WEEKLY_PLAYER', 'Player ... did not play ... in round ...')`.
3. **Anti-Duplicidad de Miembro:** Se rastrea el identificador único de membresía (`memberId`). Si un mismo jugador intenta registrarse en dos posiciones distintas del mismo quinteto, arroja `AppError(422, 'DUPLICATE_WEEKLY_PLAYER', 'Each weekly player must be unique.')`.
4. **Sanitización de Datos de Cliente:** Los campos `name`, `team` y `champions` enviados en la carga útil HTTP son descartados y sustituidos por los valores fácticos registrados en la base de datos (`candidate.name`, `candidate.team`, `candidate.champions`), forzando `imageUrl: ''` (`postgres-home-content.repository.ts:270-272`).
