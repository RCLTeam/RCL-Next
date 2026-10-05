# Persistencia y Modelo Relacional: Match Predictions

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Validación ➡️](validation.md)

---

## 1. Visión General de Persistencia

La persistencia de pronósticos deportivos y la agregación de estadísticas reside en la clase `PredictionsRepository` (`apps/api/src/modules/predictions/predictions.repository.ts:20-223`), utilizando **Drizzle ORM** sobre PostgreSQL.

El repositorio gestiona el ciclo de vida de la tabla relacional `predictions`, aplicando bloqueos transaccionales pesimistas durante el guardado de votos, garantizando la unicidad de las elecciones de cada usuario por partido y acumulando el historial de aciertos para la clasificación general de la temporada.

---

## 2. Definición del Esquema Relacional (`packages/database/src/schema.ts:600-632`)

```typescript
// packages/database/src/schema.ts:600-632
export const predictions = pgTable(
  'predictions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    discordUserId: varchar('discord_user_id', { length: 32 })
      .notNull()
      .references(() => discordUsers.discordId, { onDelete: 'cascade' }),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    selectedTeamId: uuid('selected_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    homeScore: smallint('home_score'),
    awayScore: smallint('away_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique('predictions_user_match_key').on(table.discordUserId, table.matchId),
    index('predictions_match_id_idx').on(table.matchId),
    index('predictions_discord_user_id_idx').on(table.discordUserId)
  ]
);
```

### 2.1 Restricciones y Claves Foráneas

1. **`predictions_discord_user_id_fkey`:** Clave foránea hacia `discord_users.discordId` con eliminación en cascada (`ON DELETE CASCADE`). Si un usuario de Discord es purgado de la plataforma, sus predicciones asociadas se eliminan automáticamente.
2. **`predictions_match_id_fkey`:** Clave foránea hacia `matches.id` con `ON DELETE CASCADE`. Si un partido programado se elimina físicamente, sus votos vinculados se purgan.
3. **`predictions_selected_team_id_fkey` con `ON DELETE RESTRICT`:** Clave foránea hacia `teams.id` configurada deliberadamente con restricción estricta (`onDelete: 'restrict'`, `schema.ts:626`).
   - **Implicación Forense:** Impide que cualquier administrador pueda eliminar un equipo de la base de datos si dicho equipo tiene votos asociados en la tabla de predicciones. Esto protege la integridad referencial histórica de la clasificación de pronosticadores.
4. **`predictions_user_match_key`:** Restricción de unicidad compuesta sobre `(discord_user_id, match_id)`. Asegura que un usuario solo pueda poseer exactamente un voto por enfrentamiento, sirviendo como objetivo del upsert transaccional.
5. **Índices B-Tree:** Índices individuales sobre `match_id` y `discord_user_id` para acelerar las consultas de agregación y el filtrado de votos propios en `/mine`.

---

## 3. Cobertura del Trigger SQL `set_updated_at`

A diferencia de las tablas editoriales (`editorial_articles` y `home_weekly_teams`), la tabla `predictions` **SÍ está incluida** en el bucle PL/pgSQL que instala el trigger de actualización automática de marcas de tiempo en `packages/database/drizzle/0000_initial_schema.sql:392`:

```sql
-- packages/database/drizzle/0000_initial_schema.sql:389-396
FOREACH table_name IN ARRAY ARRAY[
  'seasons', 'divisions', 'seasons_divisions', 'discord_users', 'teams', 'players', 'team_memberships',
  'roster_movements', 'rounds', 'matches', 'match_games', 'player_game_info', 'player_game_stats',
  'player_game_runes', 'player_game_build', 'predictions',
  'audit_logs'
] LOOP
  EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name);
END LOOP;
```

Cuando se ejecuta un `UPDATE` directo sobre `predictions`, la base de datos invoca automáticamente la función `set_updated_at()`, asignando `updated_at = NOW()` a nivel de motor.

---

## 4. Transaccionalidad, Bloqueo Pesimista y Upsert

### 4.1 Filtrado Perimetral del Calendario en Consulta de División (`overview`)
**Archivo**: `predictions.repository.ts:40-53`

Al consultar el resumen de predicciones de una división (`overview`), el repositorio no expone todos los partidos sin distinción; aplica un filtrado perimetral estricto a nivel de base de datos para excluir aquellos enfrentamientos que involucren equipos inactivos o no autorizados:

```typescript
// apps/api/src/modules/predictions/predictions.repository.ts:40-53
const homeTeam = alias(teams, 'prediction_home_team');
const awayTeam = alias(teams, 'prediction_away_team');
const calendar = await this.db
  .select({ match: matches })
  .from(matches)
  .innerJoin(homeTeam, eq(homeTeam.id, matches.team1Id))
  .innerJoin(awayTeam, eq(awayTeam.id, matches.team2Id))
  .where(
    and(
      eq(matches.idSeasonDivision, divisionId),
      gte(homeTeam.discordRoleId, 0n),
      gte(awayTeam.discordRoleId, 0n)
    )
  );
```

- **Mapeo Perimetral con `INNER JOIN` y Alias**: La consulta vincula las claves foráneas `matches.team1Id` y `matches.team2Id` mediante dos alias de la tabla `teams` (`prediction_home_team` y `prediction_away_team`).
- **Condición Estricta de Roles (`gte(discordRoleId, 0n)`):**
  - Tanto el equipo local como el visitante deben satisfacer obligatoriamente `discordRoleId >= 0n`.
  - **Exclusión de Equipos Inactivos / Sin Rol (`null`):** Si un equipo no tiene configurado `discordRoleId`, queda excluido del calendario de votación.
  - **Exclusión de Equipos Retirados (Sentinel `-10n`):** Aunque los equipos retirados se muestran en el calendario general de partidos para conservar el historial deportivo, quedan vetados del calendario de predicciones activas.
  - **Exclusión de Equipos Fantasma (Sentinel `-9000n`):** Los equipos comodín o de prueba técnica son automáticamente purgados de la consulta.

### 4.2 Bloqueo Pesimista de Participantes y Validación de Inactivos en `save`
**Archivo**: `predictions.repository.ts:169-222`

Al registrar o mutar un pronóstico (`save`), la operación se ejecuta dentro de una transacción ACID garantizando aislamiento, consistencia y prevención de condiciones de carrera mediante dos niveles de bloqueo pesimista:

```typescript
// apps/api/src/modules/predictions/predictions.repository.ts:169-222
await this.db.transaction(async (tx) => {
  const [match] = await tx
    .select()
    .from(matches)
    .where(eq(matches.id, pick.matchId))
    .for('update');
  if (!match) throw notFound('Match');

  const participants = await tx
    .select({ id: teams.id, discordRoleId: teams.discordRoleId })
    .from(teams)
    .where(inArray(teams.id, [match.team1Id, match.team2Id]))
    .for('share');

  if (
    !match.team1Id ||
    !match.team2Id ||
    ![match.team1Id, match.team2Id].every((id) =>
      participants.some(
        (team) => team.id === id && team.discordRoleId !== null && team.discordRoleId >= 0n
      )
    )
  )
    throw new AppError(
      409,
      'INACTIVE_TEAMS',
      'Predictions are not allowed for matches with inactive or ghost teams.'
    );

  if (!predictionWindow(match.scheduledAt, match.status, new Date()).open)
    throw new AppError(409, 'PREDICTIONS_CLOSED', 'Voting is closed.');

  const home = pick.selectedTeamId === match.team1Id;
  if (!home && pick.selectedTeamId !== match.team2Id)
    throw new AppError(400, 'INVALID_TEAM', 'Choose a match participant.');

  const wins = Math.floor(match.bestOf / 2) + 1;
  const winnerScore = home ? pick.homeScore : pick.awayScore;
  const loserScore = home ? pick.awayScore : pick.homeScore;
  if (
    (pick.homeScore !== null || pick.awayScore !== null) &&
    (winnerScore !== wins || loserScore === null || loserScore < 0 || loserScore >= wins)
  )
    throw new AppError(400, 'INVALID_SCORE', 'Invalid series score.');

  await tx
    .insert(predictions)
    .values({ ...pick, discordUserId: userId })
    .onConflictDoUpdate({
      target: [predictions.discordUserId, predictions.matchId],
      set: {
        selectedTeamId: pick.selectedTeamId,
        homeScore: pick.homeScore,
        awayScore: pick.awayScore,
        updatedAt: new Date()
      }
    });
});
```

1. **Bloqueo Exclusivo `FOR UPDATE` en `matches` (`líneas 171-175`):** Serializa cualquier concurrencia sobre el partido para prevenir modificaciones en caso de que esté cancelándose, concluyendo o sufriendo reprogramaciones de horario simultáneas.
2. **Bloqueo Compartido `FOR SHARE` en `teams` (`líneas 177-181`):** Ejecuta un `SELECT ... FOR SHARE` sobre los dos equipos contendientes (`inArray(teams.id, [match.team1Id, match.team2Id])`). Este bloqueo compartido garantiza estabilidad de lectura en las filas de los equipos sin bloquear otros votos concurrentes, impidiendo que los roles o estados de los participantes muten durante la validación del pronóstico.
3. **Validación Transaccional de Equipos Activos (`líneas 182-195`):**
   - Comprueba que ambos contendientes existan en la tabla `teams` y que ambos posean `discordRoleId !== null && discordRoleId >= 0n`.
   - Si cualquiera de los dos equipos es inactivo, retirado (sentinel `-10n`), fantasma (sentinel `-9000n`) o carece de rol configurado, la transacción aborta inmediatamente arrojando:
     ```typescript
     throw new AppError(
       409,
       'INACTIVE_TEAMS',
       'Predictions are not allowed for matches with inactive or ghost teams.'
     );
     ```
4. **Re-verificación de Ventana Abierta (`PREDICTIONS_CLOSED`, `líneas 196-197`):** Comprueba `predictionWindow(...).open` dentro del contexto transaccional bloqueado. Si el partido comenzó durante el vuelo de la petición HTTP, la transacción aborta con `AppError(409, 'PREDICTIONS_CLOSED')`.
5. **Validación de Participante y Tanteo (`líneas 198-208`):** Se verifica que el equipo seleccionado pertenezca al partido (`INVALID_TEAM`) y que el tanteo Best-Of respete la cota matemática del formato (`INVALID_SCORE`).
6. **Upsert Atómico (`onConflictDoUpdate`, `líneas 209-220`):** Si el usuario ya había votado previamente en ese partido, se actualiza el equipo seleccionado, los tanteos y la fecha de modificación en un único comando atómico sobre la restricción de unicidad compuesta `predictions_user_match_key`.

---

## 5. Agregación del Ranking y de los Recuentos en SQL

`overview` no descarga los votos individuales de la temporada. El ranking y los recuentos por partido se calculan con consultas agregadas en PostgreSQL; el proceso Node.js solo recibe una fila por usuario clasificado y una fila por partido mostrado con resultado publicado.

### 5.1 Ranking de temporada (`predictions.repository.ts:54-98`)

```sql
-- Forma de la consulta que genera Drizzle (simplificada)
SELECT du.discord_id, du.username, du.global_name, du.avatar_hash,
       count(*)                                          AS total,
       count(*) FILTER (WHERE correct)                   AS correct,
       count(*) FILTER (WHERE correct AND exact)         AS correct_exact,
       count(*) FILTER (WHERE NOT (correct) AND exact)   AS wrong_exact
FROM predictions p
JOIN matches m            ON m.id = p.match_id
JOIN seasons_divisions sd ON sd.id = m.id_season_division
JOIN discord_users du     ON du.discord_id = p.discord_user_id
WHERE sd.season_name = :season
  AND m.status IN ('completed', 'forfeit')
  AND m.winner_team_id IS NOT NULL
GROUP BY du.discord_id;
-- correct = p.selected_team_id = m.winner_team_id
-- exact   = p.home_score = m.team1_score AND p.away_score = m.team2_score
```

1. **Ámbito de temporada:** se filtra por `seasons_divisions.season_name`, no por la división solicitada. El ranking acumula los votos de todas las divisiones de la temporada, incluidos los partidos de equipos inactivos o retirados que no aparecen en el calendario de votación.
2. **Partidos puntuables:** solo cuentan los partidos `completed` o `forfeit` con `winner_team_id` asignado. Un usuario cuyos votos están todos en partidos sin resultado no aparece en el ranking.
3. **Votos sin marcador:** si `home_score` o `away_score` son `NULL`, la comparación `exact` es `NULL` y las cláusulas `FILTER` la descartan; el voto cuenta como «ganador sin marcador exacto».
4. **Puntos:** se calculan en TypeScript a partir de los cuatro recuentos con `predictionPoints` (`prediction-policy.ts`), sin duplicar el baremo en SQL: `correct_exact × predictionPoints(true, true) + (correct − correct_exact) × predictionPoints(true, false) + wrong_exact × predictionPoints(false, true) + (total − correct − wrong_exact) × predictionPoints(false, false)`.
5. **Nombre y avatar:** `name` es `global_name` o, si es `NULL`, `username`; `avatarHash` se devuelve tal cual. Solo se seleccionan esas columnas de `discord_users`.
6. **Ordenación:** se mantiene en TypeScript (`predictions.repository.ts:144-152`) con `localeCompare` para conservar el orden alfabético de la API: puntos DESC, aciertos DESC, nombre ASC y Discord ID ASC.

### 5.2 Recuentos por partido (`predictions.repository.ts:99-125`)

Solo se consultan los partidos de la jornada mostrada que están `completed` o `forfeit` (los únicos que publican `votes` y `homePercent`). Si no hay ninguno, no se ejecuta la consulta.

```sql
SELECT p.match_id,
       count(*)                                           AS votes,
       count(*) FILTER (WHERE p.selected_team_id = m.team1_id) AS home
FROM predictions p
JOIN matches m ON m.id = p.match_id
WHERE p.match_id IN (:revealed)
GROUP BY p.match_id;
```

Un partido finalizado sin votos no devuelve fila: la respuesta publica `votes: 0` y `homePercent: null`. El porcentaje se redondea en TypeScript con `Math.round((100 * home) / votes)`.

### 5.3 Filas leídas por petición

| Consulta | Filas devueltas |
|---|---|
| División (`seasons_divisions`) | 1 |
| Jornadas de la división (`rounds`) | Jornadas de la división |
| Calendario (`matches`) | Partidos de la división con equipos activos |
| Ranking | Usuarios con al menos un voto en un partido puntuable de la temporada |
| Recuentos | Partidos mostrados con resultado publicado y al menos un voto |

El número de votos de la temporada no influye en las filas transferidas. Las agregaciones siguen recorriendo en PostgreSQL los votos de los partidos finalizados de la temporada, apoyándose en los índices `predictions_match_id_idx` y `predictions_discord_user_id_idx`. El endpoint sigue sin caché y la web lo consulta cada 15 segundos mientras la página está abierta (`apps/web/src/features/predictions/usePredictions.ts`).
