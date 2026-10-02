# Diccionario de Mapeo Relacional de Estadísticas ROFL

[⬅️ Volver a ROFL Pipeline](README.md) | [Siguiente: API ROFL Upload ➡️](../api/rofl-upload/README.md)

---

## 1. Visión General

El bloque `statsJson` deserializado por `apps/parser/roflParser.py` contiene más de 75 métricas individuales por participante. El sistema transforma y normaliza estos valores a través de `apps/api/src/modules/rofl-upload/processing/transform-parser-json.ts` y los persiste en una jerarquía relacional normalizada de **5 tablas de PostgreSQL** definidas con Drizzle ORM (`packages/database/src/schema.ts:363-560`).

---

## 2. Jerarquía Relacional de Destino

```
matches (1)
   │
   └──► match_games (N)
           │
           └──► player_game_info (10 participantes por partida)
                   │
                   ├──► player_game_stats (1:1 compartiendo id UUID)
                   ├──► player_game_runes (1:1 compartiendo id UUID)
                   └──► player_game_build (1:1 compartiendo id UUID)
```

Las tablas `player_game_stats`, `player_game_runes` y `player_game_build` utilizan como clave primaria el mismo identificador UUID de `player_game_info.id` (`foreignKey({ columns: [t.id], foreignColumns: [playerGameInfo.id] }).onDelete('cascade')`), garantizando una cardinalidad $1:1$ estricta sin claves foráneas redundantes.

---

## 3. Mapeo a Nivel de Partida (`match_games`)

| Campo en `statsJson` / Metadatos | Columna Drizzle en `match_games` | Tipo SQL | Regla de Transformación / Lógica |
|---|---|---|---|
| `meta.gameLength` | `duration_seconds` | `integer` | `Math.floor(Number(gameLength) / 1000)` (`roflParser.py:371`). |
| Inferencia de serie | `game_number` | `smallint` | Secuencial calculado con bloqueo pesimista `FOR UPDATE` (`postgres-rofl-upload.repository.ts:369, 386-395`). |
| `meta.fuente.archivo` / `gameId` | `external_game_id` | `varchar(128)` | Nombre base normalizado del archivo `.rofl` sin sufijos (`transform-parser-json.ts:182-184`). |
| `p.TEAM` + `p.WIN` | `winner_team_id` | `uuid` | UUID del equipo ganador (`blueTeamId` si gana 100, `redTeamId` si gana 200) (`roflParser.py:340-346`). |
| Parámetros de serie | `matches_id` | `uuid` | Clave foránea al registro del partido en `matches` (`schema.ts:367`). |
| Roster auditado | `blue_team_id` / `red_team_id` | `uuid` | Claves foráneas a los equipos participantes (`schema.ts:369-370`). |

---

## 4. Mapeo de Identidad y Rol (`player_game_info`)

| Campo en `statsJson` | Columna Drizzle | Tipo SQL | Regla de Transformación / Lógica |
|---|---|---|---|
| `crypto.randomUUID()` | `id` | `uuid` | Identificador primario compartido con las 3 tablas hijas (`postgres-rofl-upload.repository.ts:424`). |
| Identificador de partida | `match_game_id` | `uuid` | Clave foránea al registro padre en `match_games` (`schema.ts:417`). |
| `RIOT_ID_GAME_NAME` # `RIOT_ID_TAG_LINE` | `player_id` | `uuid` | Resuelto contra `players.id` mediante búsqueda insensible a mayúsculas y derivado a la cuenta principal (`findPlayersByRiotIds` en `postgres-rofl-upload.repository.ts:88-134`). |
| Asignación de equipo | `team_id` | `uuid` | UUID del equipo al que pertenece el jugador según el roster del partido (`postgres-rofl-upload.repository.ts:425`). |
| `TEAM` | `side` | `game_side` enum | Si `TEAM === 100` $\rightarrow$ `'blue'`; si `TEAM === 200` $\rightarrow$ `'red'` (`schema.ts:420`). |
| `SKIN` | `champion` | `varchar(64)` | Identificador o nombre de aspecto/campeón de Riot (`roflParser.py:179`). |
| Múltiples fuentes en cascada | `position` | `varchar(64)` | Cascada de resolución: `INDIVIDUAL_POSITION` $\rightarrow$ `TEAM_POSITION` $\rightarrow$ `PLAYER_POSITION` $\rightarrow$ `PLAYER_ROLE` (`roflParser.py:181-187`). |

### 4.1 Derivación de Cuentas Secundarias / Smurfs a Cuenta Principal (`findPlayersByRiotIds`)

En el ecosistema competitivo de RCL, los jugadores pueden disputar partidas oficiales utilizando cuentas secundarias (*smurfs*) vinculadas a su identidad en Discord. Para evitar la fragmentación de estadísticas entre distintas cuentas de Riot y asegurar la consistencia del perfil competitivo, el método `findPlayersByRiotIds` (`apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:88-134`) implementa una política obligatoria de redirección hacia la cuenta principal (*main*):

1. **Búsqueda Insensible a Mayúsculas:**
   Al procesar los participantes de un archivo `.rofl`, el repositorio busca las cuentas en la tabla `players` contrastando `gameName` y `riotTag` de forma insensible a mayúsculas (`LOWER(players.game_name) = LOWER(...) AND LOWER(players.riot_tag) = LOWER(...)`) e integrando la tabla `discord_users` mediante un `INNER JOIN`:
   ```typescript
   // apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:92-108
   const conditions = riotIds.map((r) =>
     and(
       sql`LOWER(${players.gameName}) = LOWER(${r.gameName})`,
       sql`LOWER(${players.riotTag}) = LOWER(${r.riotTag})`
     )
   );
   const rows = await this.db
     .select({
       playerId: players.id,
       discordUserId: players.discordUserId,
       gameName: players.gameName,
       riotTag: players.riotTag,
       discordUsername: discordUsers.username
     })
     .from(players)
     .innerJoin(discordUsers, eq(players.discordUserId, discordUsers.discordId))
     .where(or(...conditions));
   ```

2. **Resolución de la Cuenta Principal Asociada:**
   Si la cuenta localizada es una cuenta secundaria (`isMain: false`), o para cualquier cuenta del lote, el repositorio toma todos los `discordUserId` correspondientes y consulta todas las cuentas con `isMain: true` asociadas al mismo usuario de Discord:
   ```typescript
   // apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:111-115
   const discordIds = rows.flatMap((row) => (row.discordUserId ? [row.discordUserId] : []));
   const mainAccounts = await this.db
     .select({ id: players.id, discordUserId: players.discordUserId })
     .from(players)
     .where(and(inArray(players.discordUserId, discordIds), eq(players.isMain, true)));
   ```

3. **Exigencia Estricta de Unicidad:**
   Debe existir **exactamente una** cuenta principal para dicho usuario de Discord (`if (!main || mains.length !== 1)`). Si no existe una cuenta principal o hay múltiples cuentas principales, el proceso de importación se aborta de forma inmediata arrojando una excepción:
   ```typescript
   // apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:118-124
   const mains = mainAccounts.filter((account) => account.discordUserId === row.discordUserId);
   const main = mains[0];
   if (!main || mains.length !== 1) {
     throw new Error(
       `Cannot import statistics for ${row.gameName}#${row.riotTag ?? ''}: exactly one main account must exist for this Discord user.`
     );
   }
   ```

4. **Mapeo de Identidad y Persistencia Consolidada:**
   En el objeto resultante (`PlayerLookupResult`):
   - Se conserva el Riot ID del archivo de repetición (`gameName`, `riotTag`) para el matching del lote en memoria.
   - El identificador `playerId` se reasigna a `main.id`.

   En consecuencia, cuando se persisten los registros de la partida en PostgreSQL (`postgres-rofl-upload.repository.ts:430, 479`), la columna `player_game_info.player_id` almacena el UUID de la cuenta principal. Todas las estadísticas relacionales (`player_game_info`, `player_game_stats`, `player_game_build`, `player_game_runes`), los reconocimientos de MVP y el historial competitivo se acumulan en el perfil primario del jugador en la base de datos, garantizando que el rendimiento deportivo se atribuya a la identidad competitiva central del invocador.

---

## 5. Mapeo de Estadísticas de Rendimiento (`player_game_stats`)

Esta tabla contiene 40 métricas de combate, economía, visión, estructuras y objetivos neutrales (`schema.ts:501-560`):

| Campo en `statsJson` | Columna Drizzle | Tipo SQL | Notas y Cotas |
|---|---|---|---|
| `CHAMPIONS_KILLED` | `kills` | `smallint` | No negativo (`>= 0`) (`roflParser.py:193`). |
| `NUM_DEATHS` | `deaths` | `smallint` | No negativo (`>= 0`) (`roflParser.py:194`). |
| `ASSISTS` | `assists` | `smallint` | No negativo (`>= 0`) (`roflParser.py:195`). |
| `MINIONS_KILLED` + `NEUTRAL_MINIONS_KILLED` | `cs` | `smallint` | Suma de súbditos de línea y monstruos de jungla (`roflParser.py:204`). |
| `TOTAL_DAMAGE_DEALT_TO_CHAMPIONS` | `damage_to_champions` | `integer` | Daño total infligido a campeones rivales (`roflParser.py:206`). |
| `VISION_SCORE` | `vision_score` | `integer` | Puntuación total de visión (`roflParser.py:222`). |
| `DOUBLE_KILLS` | `double_kills` | `integer` | Asesinatos dobles (`roflParser.py:196`). |
| `TRIPLE_KILLS` | `triple_kills` | `integer` | Asesinatos triples (`roflParser.py:197`). |
| `QUADRA_KILLS` | `quadra_kills` | `integer` | Asesinatos cuádruples (`roflParser.py:198`). |
| `PENTA_KILLS` | `penta_kills` | `integer` | Asesinatos quíntuples (`roflParser.py:199`). |
| `LARGEST_KILLING_SPREE` | `largest_killing_spree` | `integer` | Mayor racha de asesinatos sin morir (`roflParser.py:200`). |
| `GOLD_EARNED` | `gold_earned` | `integer` | Oro total acumulado (`roflParser.py:203`). |
| `LEVEL` | `level` | `integer` | Nivel final del campeón (1-18) (`roflParser.py:205`). |
| `TOTAL_DAMAGE_TAKEN_FROM_CHAMPIONS` | `damage_taken_from_champions` | `integer` | Daño recibido de campeones (`roflParser.py:207`). |
| `TOTAL_DAMAGE_SELF_MITIGATED` | `damage_mitigated` | `integer` | Daño mitigado mediante escudos y resistencias (`roflParser.py:210`). |
| `TOTAL_TIME_CROWD_CONTROL_DEALT_TO_CHAMPIONS` | `crowd_control_time` | `integer` | Segundos de control de adversario aplicado (`roflParser.py:211`). |
| `TURRETS_KILLED` | `turrets_killed` | `integer` | Torres destruidas personalmente (`roflParser.py:215`). |
| `TURRET_TAKEDOWNS` | `turret_takedowns` | `integer` | Participación en derribos de torres (`roflParser.py:216`). |
| `BARRACKS_KILLED` | `inhibitors_killed` | `integer` | Inhibidores destruidos personalmente (`roflParser.py:217`). |
| `BARRACKS_TAKEDOWNS` | `inhibitor_takedowns` | `integer` | Participación en derribos de inhibidores (`roflParser.py:218`). |
| `WARD_PLACED` | `wards_placed` | `integer` | Guardianes de visión colocados (`roflParser.py:223`). |
| `WARD_KILLED` | `wards_destroyed` | `integer` | Guardianes de visión destruidos (`roflParser.py:224`). |
| `VISION_WARDS_BOUGHT_IN_GAME` | `control_wards_purchased` | `integer` | Guardianes de control comprados (`roflParser.py:225`). |
| `WARD_PLACED_DETECTOR` | `detector_wards_placed` | `integer` | Guardianes detectores colocados (`roflParser.py:226`). |
| `PING` | `pings` | `integer` | Número total de señales enviadas (`roflParser.py:229`). |
| `SUMMON_SPELL1_CAST` | `summoner_spell_1_casts` | `integer` | Lanzamientos de hechizo de invocador 1 (`roflParser.py:237`). |
| `SUMMON_SPELL2_CAST` | `summoner_spell_2_casts` | `integer` | Lanzamientos de hechizo de invocador 2 (`roflParser.py:238`). |
| `DRAGON_KILLS` | `dragons_killed` | `integer` | Dragones asegurados personalmente (`roflParser.py:242`). |
| `BARON_KILLS` | `barons_killed` | `integer` | Barones asegurados personalmente (`roflParser.py:243`). |
| `RIFT_HERALD_KILLS` | `rift_heralds_killed` | `integer` | Heraldos asegurados personalmente (`roflParser.py:244`). |
| `HORDE_KILLS` | `void_grubs_killed` | `integer` | Larvas del vacío aseguradas (`roflParser.py:245`). |
| `ELDER_DRAGON_KILLS` | `elder_dragons_killed` | `integer` | Dragones ancianos asegurados (`roflParser.py:246`). |
| `OBJECTIVES_STOLEN` | `objectives_stolen` | `integer` | Objetivos mayores robados (`roflParser.py:247`). |
| `OBJECTIVES_STOLEN_ASSISTS` | `objectives_stolen_assists` | `integer` | Asistencias en robos de objetivos (`roflParser.py:248`). |
| `LARGEST_ABILITY_DAMAGE` | `largest_ability_damage` | `integer` | Mayor golpe infligido por habilidad (`roflParser.py:252`). |
| `LARGEST_ATTACK_DAMAGE` | `largest_attack_damage` | `integer` | Mayor golpe infligido por ataque básico (`roflParser.py:253`). |
| `LARGEST_CRITICAL_STRIKE` | `largest_critical_strike` | `integer` | Mayor golpe crítico (`roflParser.py:254`). |
| `LONGEST_TIME_SPENT_LIVING` | `longest_time_living` | `integer` | Tiempo máximo transcurrido sin morir (s) (`roflParser.py:255`). |
| `TOTAL_TIME_SPENT_DEAD` | `time_spent_dead` | `integer` | Tiempo total acumulado en pantalla gris (s) (`roflParser.py:256`). |
| Asignación editorial | `is_mvp` | `boolean` | Por defecto `false` (`schema.ts:544`). |

---

## 6. Mapeo de Runas y Fragmentos Adaptativos (`player_game_runes`)

| Campo en `statsJson` | Columna Drizzle | Tipo SQL | Descripción |
|---|---|---|---|
| `PERK0` | `primary_keystone_id` | `integer` | ID de la runa clave (Keystone) (`roflParser.py:129`). |
| `PERK_SUB_STYLE` | `secundary_rune_id` | `integer` | ID del árbol de runas secundario (`roflParser.py:135`). |
| `PERK_PRIMARY_STYLE` | `primary_perk` | `integer` | ID del árbol de runas primario (`roflParser.py:128`). |
| `PERK1` | `primary_perk_1` | `integer` | ID de la primera runa menor primaria (`roflParser.py:130`). |
| `PERK2` | `primary_perk_2` | `integer` | ID de la segunda runa menor primaria (`roflParser.py:131`). |
| `PERK3` | `primary_perk_3` | `integer` | ID de la tercera runa menor primaria (`roflParser.py:132`). |
| `PERK4` | `secundary_perk_1` | `integer` | ID de la primera runa secundaria (`roflParser.py:136`). |
| `PERK5` | `secundary_perk_2` | `integer` | ID de la segunda runa secundaria (`roflParser.py:137`). |
| `STAT_PERK_0` | `stat_perk_offense` | `integer` | ID del fragmento adaptativo ofensivo (`roflParser.py:140`). |
| `STAT_PERK_1` | `stat_perk_flex` | `integer` | ID del fragmento adaptativo flexible (`roflParser.py:141`). |
| `STAT_PERK_2` | `stat_perk_defense` | `integer` | ID del fragmento adaptativo defensivo (`roflParser.py:142`). |

---

## 7. Mapeo de Equipamiento y Hechizos (`player_game_build`)

| Campo en `statsJson` | Columna Drizzle | Tipo SQL | Descripción |
|---|---|---|---|
| `ITEM0` | `item_0` | `integer` | ID del objeto en el slot 0 de inventario (`roflParser.py:150-153`). |
| `ITEM1` | `item_1` | `integer` | ID del objeto en el slot 1 de inventario (`roflParser.py:150-153`). |
| `ITEM2` | `item_2` | `integer` | ID del objeto en el slot 2 de inventario (`roflParser.py:150-153`). |
| `ITEM3` | `item_3` | `integer` | ID del objeto en el slot 3 de inventario (`roflParser.py:150-153`). |
| `ITEM4` | `item_4` | `integer` | ID del objeto en el slot 4 de inventario (`roflParser.py:150-153`). |
| `ITEM5` | `item_5` | `integer` | ID del objeto en el slot 5 de inventario (`roflParser.py:150-153`). |
| `ITEM6` | `trinket` | `integer` | ID del objeto en el slot 6 (accesorio / tótem) (`roflParser.py:150-153`). |
| `SUMMONER_SPELL_1` | `summoner_spell_1_id` | `integer` | ID del primer hechizo de invocador (`roflParser.py:235`). |
| `SUMMONER_SPELL_2` | `summoner_spell_2_id` | `integer` | ID del segundo hechizo de invocador (`roflParser.py:236`). |
