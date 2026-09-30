# Restricciones de Integridad, Índices y Disparadores PL/pgSQL

[⬅️ Volver a Documentación de Base de Datos](./README.md) | [Siguiente: Migraciones y Concurrencia ➡️](./migrations.md)

---

## 1. Restricciones Relacionales y Validación de Dominio (`CHECK`)

El modelo implementa reglas estrictas a nivel de motor de base de datos para impedir que estados inválidos o inconsistentes sean persistidos por la aplicación o el parser de repeticiones.

### 1.1 Reglas de Integridad Competitiva

| Restricción | Tabla | Expresión SQL / Condición | Código de Error | Justificación y Comportamiento |
|---|---|---|---|---|
| `seasons_dates_check` | `seasons` | `"ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on"` | `23514` | Impide que una temporada finalice antes de haber comenzado (`schema.ts:119-122`). |
| `team_memberships_captain_role_check` | `team_memberships` | `"is_captain" = false OR "role" IN ('top', 'jungle', 'mid', 'adc', 'support')` | `23514` | Solo los 5 roles competitivos pueden ser capitanes. Suplentes, entrenadores y staff no pueden ostentar capitanía (`schema.ts:230-233`). |
| `matches_different_teams_check` | `matches` | `"team1_id" <> "team2_id"` | `23514` | Un equipo no puede competir contra sí mismo (`schema.ts:344`). |
| `matches_best_of_check` | `matches` | `"best_of" IN (1, 3, 5)` | `23514` | Formatos de serie estrictos: BO1, BO3 o BO5 (`schema.ts:345`). |
| `matches_scores_check` | `matches` | `"team1_score" >= 0 AND "team2_score" >= 0` | `23514` | Marcadores no negativos (`schema.ts:346`). |
| `matches_winner_participant_check` | `matches` | `"winner_team_id" IS NULL OR "winner_team_id" IN ("team1_id", "team2_id")` | `23514` | El ganador debe ser obligatoriamente uno de los dos equipos participantes (`schema.ts:347-350`). |
| `match_games_different_teams_check` | `match_games` | `"blue_team_id" <> "red_team_id"` | `23514` | El bando azul y el bando rojo deben ser equipos distintos (`schema.ts:400`). |
| `match_games_number_check` | `match_games` | `"game_number" > 0` | `23514` | Los mapas son ordinales positivos (1, 2, ...) (`schema.ts:401`). |
| `match_games_duration_check` | `match_games` | `"duration_seconds" IS NULL OR "duration_seconds" > 0` | `23514` | Duraciones estrictamente positivas (`schema.ts:402`). |
| `match_games_winner_participant_check` | `match_games` | `"winner_team_id" IS NULL OR "winner_team_id" IN ("blue_team_id", "red_team_id")` | `23514` | El vencedor del mapa debe ser el equipo azul o el equipo rojo (`schema.ts:403-406`). |

### 1.2 Reglas de Estadísticas Deportivas y Editorial

| Restricción | Tabla | Expresión SQL / Condición | Código de Error | Justificación y Comportamiento |
|---|---|---|---|---|
| `player_game_stats_non_negative_check` | `player_game_stats` | `"kills" >= 0 AND "deaths" >= 0 AND "assists" >= 0 AND "cs" >= 0 AND "damage_to_champions" >= 0` | `23514` | Las métricas fundamentales de partida no admiten números negativos (`schema.ts:554-557`). |
| `player_game_stats_vision_check` | `player_game_stats` | `"vision_score" IS NULL OR "vision_score" >= 0` | `23514` | Puntuación de visión no negativa si está presente (`schema.ts:558`). |
| `player_game_stats_rofl_non_negative_check` | `player_game_stats` | 32 cláusulas `IS NULL OR col >= 0` sobre métricas avanzadas | `23514` | Objetivos, daño y oro de repeticiones ROFL no pueden ser negativos (`schema.ts:559-597`). |
| `editorial_kind_check` | `editorial_articles` | `"kind" IN ('noticia', 'reportaje', 'entrevista', 'otro')` | `23514` | Categorías editoriales válidas (`schema.ts:689`). |
| `editorial_order_check` | `editorial_articles` | `"home_order" >= 0` | `23514` | Posición en portada no negativa (`schema.ts:690`). |

---

## 2. Índices Únicos Parciales y Claves Compuestas

### 2.1 Índice Único Parcial: Un Solo Capitán por Equipo
En `packages/database/src/schema.ts:236-238` y `0000_initial_schema.sql:360`:
```sql
CREATE UNIQUE INDEX "team_memberships_unique_captain" 
ON "team_memberships" ("team_id") 
WHERE "team_memberships"."is_captain" = true;
```
- **Mecanismo:** Un índice parcial filtra exclusivamente las filas donde `is_captain = true`.
- **Efecto de Integridad:** Un club puede tener múltiples jugadores (`is_captain = false`), pero **únicamente un miembro activo puede tener `is_captain = true`**.
- **Comportamiento ante Mutaciones:** Intentar promover a un segundo jugador como capitán sin degradar previamente al capitán actual arroja un error de clave duplicada (`SQLSTATE 23505`).

### 2.2 Claves Primarias Compuestas Naturales
1. **`team_memberships` (`team_id`, `discord_user_id`):** Garantiza que un usuario no pueda figurar duplicado en la misma plantilla (`schema.ts:229`).
2. **`rounds` (`id`, `id_season_division`):** El número de jornada `id` (1, 2, ...) es relativo a la temporada y división concreta, permitiendo que la Jornada 1 coexista simultáneamente en "Premier" y "Ascend" (`schema.ts:294`).

---

## 3. Disparadores PL/pgSQL y Procedimientos Almacenados

El archivo `packages/database/drizzle/0000_initial_schema.sql:379-456` define tres mecanismos transaccionales ejecutados directamente en el servidor de PostgreSQL:

### 3.1 Actualización Automática Temporal (`set_updated_at`)
- **Procedimiento:**
  ```sql
  CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
  END;
  $$;
  ```
- **Lógica de Reloj Real:** Utiliza `clock_timestamp()` en lugar de `now()`. Mientras que `now()` devuelve la hora de inicio de la transacción actual, `clock_timestamp()` devuelve el tiempo de reloj en tiempo real, registrando avances precisos incluso en actualizaciones sucesivas dentro de un mismo bloque transaccional.
- **Tablas Aplicadas Dinámicamente (17 tablas exactas):**
  `seasons`, `divisions`, `seasons_divisions`, `discord_users`, `teams`, `players`, `team_memberships`, `roster_movements`, `rounds`, `matches`, `match_games`, `player_game_info`, `player_game_stats`, `player_game_runes`, `player_game_build`, `predictions`, `audit_logs` (`0000_initial_schema.sql:389-396`).
- **Tablas Excluidas:**
  1. `home_weekly_teams` y `editorial_articles`: Poseen la columna `updated_at`, pero **no** forman parte del bucle de triggers. La aplicación o el ORM deben actualizar explícitamente su timestamp al modificar filas.
  2. `auth_sessions` y `oauth_states`: Carecen de la columna `updated_at` por ser entidades de ciclo de vida efímero sin mutación.

---

### 3.2 Validación de Pertenencia de Equipos (`check_match_games_teams`)
- **Procedimiento:**
  ```sql
  CREATE FUNCTION check_match_games_teams() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE
    v_team1_id uuid;
    v_team2_id uuid;
  BEGIN
    SELECT team1_id, team2_id INTO v_team1_id, v_team2_id
    FROM matches
    WHERE id = NEW.matches_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent match does not exist' USING ERRCODE = '23503';
    END IF;

    IF (NEW.blue_team_id <> v_team1_id AND NEW.blue_team_id <> v_team2_id)
       OR (NEW.red_team_id <> v_team1_id AND NEW.red_team_id <> v_team2_id) THEN
      RAISE EXCEPTION 'Blue and red teams must belong to the parent match' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END;
  $$;
  ```
- **Disparador:** `BEFORE INSERT OR UPDATE ON match_games FOR EACH ROW` (`0000_initial_schema.sql:422-424`).
- **Casos de Excepción y Códigos de Error:**
  1. Si `matches_id` no existe en la tabla `matches`: emite `'Parent match does not exist'` con código **`23503`** (Foreign Key Violation).
  2. Si `blue_team_id` o `red_team_id` no coinciden con los clubes contendientes `{matches.team1_id, matches.team2_id}`: emite `'Blue and red teams must belong to the parent match'` con código **`23514`** (Check Violation).
- **Justificación:** Previene inconsistencias donde una partida de League of Legends sea asociada a un partido entre el Club A y el Club B, pero sus bandos azul o rojo sean asignados erróneamente al Club C.

---

### 3.3 Integridad Atómica Diferida de Instantánea de Jugador (`require_complete_player_game`)
- **Procedimiento:**
  ```sql
  CREATE FUNCTION require_complete_player_game() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE participation_id uuid;
  BEGIN
    IF TG_OP = 'DELETE' THEN participation_id := OLD.id;
    ELSE participation_id := NEW.id;
    END IF;
    IF EXISTS (SELECT 1 FROM player_game_info WHERE id = participation_id)
      AND (
        NOT EXISTS (SELECT 1 FROM player_game_stats WHERE id = participation_id)
        OR NOT EXISTS (SELECT 1 FROM player_game_runes WHERE id = participation_id)
        OR NOT EXISTS (SELECT 1 FROM player_game_build WHERE id = participation_id)
      ) THEN
      RAISE EXCEPTION 'Incomplete player game snapshot' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.id <> NEW.id
       AND EXISTS (SELECT 1 FROM player_game_info WHERE id = OLD.id) THEN
      RAISE EXCEPTION 'Snapshot identity cannot be moved' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END;
  $$;
  ```
- **Disparador de Restricción:**
  ```sql
  CREATE CONSTRAINT TRIGGER complete_player_game 
  AFTER INSERT OR UPDATE OR DELETE ON ... 
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW 
  EXECUTE FUNCTION require_complete_player_game();
  ```
  Aplicado sobre: `player_game_info`, `player_game_stats`, `player_game_runes` y `player_game_build` (`0000_initial_schema.sql:451-454`).
- **Comportamiento y Mecánica Operativa:**
  1. **Evaluación Diferida al `COMMIT` (`INITIALLY DEFERRED`):** La validación no se ejecuta fila por fila en el momento exacto del `INSERT`, sino al emitirse el `COMMIT` final de la transacción. Esto permite al servicio de subida de repeticiones insertar en cualquier secuencia arbitraria (ej. `info` -> `build` -> `runes` -> `stats`) sin arrojar violaciones prematuras.
  2. **Rechazo de Instantáneas Incompletas:** Si al llegar el `COMMIT` existe la fila en `player_game_info` pero falta alguna de las tres tablas complementarias (`stats`, `runes`, `build`), lanza `'Incomplete player game snapshot'` con código **`23514`** y revierte toda la transacción.
  3. **Inmutabilidad de Identidad:** Si se intenta modificar el identificador (`OLD.id <> NEW.id`), arroja `'Snapshot identity cannot be moved'` con código **`23514`**.
  4. **Borrado en Cascada Permitido:** Si se elimina la fila padre en `player_game_info`, las claves foráneas borran en cascada las filas en `stats`, `runes` y `build`. Al evaluarse en el `COMMIT`, `EXISTS (SELECT 1 FROM player_game_info WHERE id = participation_id)` devuelve falso, por lo que el borrado completo se realiza sin errores.
  5. **Protección contra Borrado Parcial:** Si un usuario o script intenta borrar directamente una fila secundaria (ej. `DELETE FROM player_game_build`), el disparador detecta que `player_game_info` aún existe pero falta la tabla complementaria, revirtiendo la operación con código `23514`.
