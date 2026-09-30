# Persistencia y Modelo Relacional: Match Predictions

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Validación ➡️](validation.md)

---

## 1. Visión General de Persistencia

La persistencia de pronósticos deportivos y la agregación de estadísticas reside en la clase `PredictionsRepository` (`apps/api/src/modules/predictions/predictions.repository.ts:9-135`), utilizando **Drizzle ORM** sobre PostgreSQL.

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

En `predictions.repository.ts:101-133`, la persistencia de un voto se ejecuta dentro de una transacción ACID con aislamiento garantizado mediante bloqueo pesimista de fila:

```typescript
// predictions.repository.ts:101-133
await this.db.transaction(async (tx) => {
  const [match] = await tx
    .select()
    .from(matches)
    .where(eq(matches.id, pick.matchId))
    .for('update');
  if (!match) throw notFound('Match');
  if (!predictionWindow(match.scheduledAt, match.status, new Date()).open)
    throw new AppError(409, 'PREDICTIONS_CLOSED', 'Voting is closed.');
  // Validaciones de equipo y tanteo ...
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

1. **Bloqueo `FOR UPDATE` en `matches`:** Serializa cualquier intento concurrente de emitir votos para un partido que pudiera estar cambiando de estado o siendo reprogramado simultáneamente.
2. **Re-verificación de Ventana Abierta:** Comprueba `predictionWindow(...).open` dentro del contexto transaccional bloqueado. Si el partido comenzó durante el vuelo de la petición HTTP, la transacción aborta con `AppError(409, 'PREDICTIONS_CLOSED')`.
3. **Upsert Atómico (`onConflictDoUpdate`):** Si el usuario ya había votado previamente en ese partido, se actualiza el equipo seleccionado, los tanteos y la fecha de modificación en un único comando atómico sobre `predictions_user_match_key`.

---

## 5. Advertencia de Escalabilidad: Agregación en Memoria de Temporada

En `predictions.repository.ts:22-48`, el método `overview` ejecuta una consulta que descarga a la memoria del proceso Node.js la totalidad de predicciones de la temporada:

```typescript
// predictions.repository.ts:22-28
const votes = await this.db
  .select({ pick: predictions, match: matches, user: discordUsers })
  .from(predictions)
  .innerJoin(matches, eq(matches.id, predictions.matchId))
  .innerJoin(seasonsDivisions, eq(seasonsDivisions.id, matches.idSeasonDivision))
  .innerJoin(discordUsers, eq(discordUsers.discordId, predictions.discordUserId))
  .where(eq(seasonsDivisions.seasonName, division.seasonName));
```

### Mecanismo y Consecuencias Arquitectónicas:
1. **Ámbito Completo de Temporada:** La consulta no filtra por la división solicitada, sino por `seasonsDivisions.seasonName = division.seasonName`. En consecuencia, recupera todos los votos de todas las divisiones disputadas en esa temporada (Premier, Segunda, Tercera, etc.).
2. **Acumulación en Memoria:** El bucle itera sobre cada fila devuelta en un `Map<string, PredictorStanding>()` (`predictions.repository.ts:29-48`), evaluando si el partido está en `'completed'` o `'forfeit'` y calculando los puntos mediante `predictionPoints`.
3. **Ordenación en Array:** La lista de predictores acumulada en el Map se vuelca a un array y se ordena en memoria (`predictions.repository.ts:75-83`):
   ```typescript
   ranking: [...ranking.values()]
     .sort(
       (a, b) =>
         b.points - a.points ||
         b.correct - a.correct ||
         a.name.localeCompare(b.name) ||
         a.userId.localeCompare(b.userId)
     )
     .map((row, index) => ({ ...row, position: index + 1 }))
   ```
4. **Impacto en Rendimiento:** Si una temporada acumula 50.000 votos entre todas sus divisiones, cada petición a la página de predicciones de cualquier división transferirá los 50.000 registros desde PostgreSQL hacia Node.js, reconstruyendo la tabla de clasificación desde cero.
5. **Recomendación de Evolución:** Para temporadas de gran envergadura o crecimiento masivo de usuarios, este cálculo debe delegarse a una vista materializada de PostgreSQL o a una tabla de agregación incremental actualizada mediante un worker al finalizar cada partido.
