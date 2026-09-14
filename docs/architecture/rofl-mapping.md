# Mapeo de Estadísticas del JSON ROFL al Baseline

La migración `packages/database/drizzle/0000_initial_schema.sql` y el modelo `packages/database/src/schema.ts` contienen el esquema normalizado completo. Mantienen separadas las tablas de participación, estadísticas, runas e inventario/build; las métricas se registran por jugador y mapa individual, evitando acumulados agregados en la tabla `players`.

Para consultar el diseño de entidades, diagramas y operaciones de base de datos:
- [**Arquitectura del Parser ROFL**](rofl-parser.md): Motor binario, algoritmo de seek inverso, validación de cabecera y cotas de memoria.
- [**Modelo y Decisiones Arquitectónicas**](database.md): Decisiones de diseño, desempate y garantías relacionales.
- [**Esquema Relacional y Diagrama ER**](database-schema.md): Diagrama Mermaid ER de las 16 tablas, enums, checks y reglas de integridad.
- [**Operaciones, Concurrencia y Comandos**](database-operations.md): Bloqueos consultivos (`pg_advisory_lock`, `pg_advisory_xact_lock`), configuración del pool y comandos CLI.

---

## Identificación y Participación (`player_game_info`)

| Propiedad en JSON del Parser | Columna SQL Destino | Notas de Adaptación |
| --- | --- | --- |
| `nombre` / `tag` | `players.game_name` / `players.riot_tag` | Clave natural del jugador |
| `puuid` | `players.puuid` | Opcional, no único; cadena de texto (varchar), no UUID PostgreSQL |
| `posicion` | `player_game_info.position` | Posición reportada en partida, independiente del rol en plantilla |
| `campeon` | `player_game_info.champion` | Nombre o identificador del campeón utilizado |
| `equipo` | `player_game_info.side` / `player_game_info.team_id` | Traducir 100/200 a `side` ('blue' / 'red') y asociar al UUID del equipo |
| `riot_id` | Derivable | Combinación de `nombre#tag` |
| `resultado` | `player()` devuelve 'Win'/'Lose' | Coincide con la victoria del equipo en `match_games.winner_team_id` |
| `partida.duracion` | `match_games.duration_seconds` | Duración total en segundos |
| `partida.equipo_ganador` | `match_games.winner_team_id` | Traducir 100/200 al UUID del equipo ganador |

Los metadatos globales del archivo de repetición (fuente, `game_length_raw`, chunks y keyframes) son datos técnicos de transmisión que no constituyen estadísticas de jugador y no se persisten en `players`.

---

## Estadísticas Cuantitativas (`player_game_stats`)

| Campo del Jugador en JSON | Columna SQL | Tipo y Restricción |
| --- | --- | --- |
| `kda.kills` | `kills` | SMALLINT NOT NULL DEFAULT 0, CHECK >= 0 |
| `kda.muertes` | `deaths` | SMALLINT NOT NULL DEFAULT 0, CHECK >= 0 |
| `kda.asistencias` | `assists` | SMALLINT NOT NULL DEFAULT 0, CHECK >= 0 |
| `cs` | `cs` | SMALLINT NOT NULL DEFAULT 0, CHECK >= 0 |
| `daño_campeones` | `damage_to_champions` | INTEGER NOT NULL DEFAULT 0, CHECK >= 0 |
| `vision.score` | `vision_score` | INTEGER NULLABLE, CHECK >= 0 |
| `kda.double_kills` | `double_kills` | INTEGER NULLABLE, CHECK >= 0 |
| `kda.triple_kills` | `triple_kills` | INTEGER NULLABLE, CHECK >= 0 |
| `kda.quadra_kills` | `quadra_kills` | INTEGER NULLABLE, CHECK >= 0 |
| `kda.penta_kills` | `penta_kills` | INTEGER NULLABLE, CHECK >= 0 |
| `kda.largest_killing_spree` | `largest_killing_spree` | INTEGER NULLABLE, CHECK >= 0 |
| `oro` | `gold_earned` | INTEGER NULLABLE, CHECK >= 0 |
| `nivel` | `level` | INTEGER NULLABLE, CHECK >= 0 |
| `daño_recibido_campeones` | `damage_taken_from_champions` | INTEGER NULLABLE, CHECK >= 0 |
| `soporte.daño_mitigado` | `damage_mitigated` | INTEGER NULLABLE, CHECK >= 0 |
| `soporte.control_adversarios` | `crowd_control_time` | INTEGER NULLABLE, CHECK >= 0 |
| `estructuras.torres` | `turrets_killed` | INTEGER NULLABLE, CHECK >= 0 |
| `estructuras.derribos_torres` | `turret_takedowns` | INTEGER NULLABLE, CHECK >= 0 |
| `estructuras.inhibidores` | `inhibitors_killed` | INTEGER NULLABLE, CHECK >= 0 |
| `estructuras.derribos_inhibidores` | `inhibitor_takedowns` | INTEGER NULLABLE, CHECK >= 0 |
| `vision.wards_colocados` | `wards_placed` | INTEGER NULLABLE, CHECK >= 0 |
| `vision.wards_destruidos` | `wards_destroyed` | INTEGER NULLABLE, CHECK >= 0 |
| `vision.pinkwards_comprados` | `control_wards_purchased` | INTEGER NULLABLE, CHECK >= 0 |
| `vision.wards_detector` | `detector_wards_placed` | INTEGER NULLABLE, CHECK >= 0 |
| `pings` | `pings` | INTEGER NULLABLE, CHECK >= 0 |
| `hechizos.casts_1` | `summoner_spell_1_casts` | INTEGER NULLABLE, CHECK >= 0 |
| `hechizos.casts_2` | `summoner_spell_2_casts` | INTEGER NULLABLE, CHECK >= 0 |
| `monstruos.dragones` | `dragons_killed` | INTEGER NULLABLE, CHECK >= 0 |
| `monstruos.barones` | `barons_killed` | INTEGER NULLABLE, CHECK >= 0 |
| `monstruos.heraldos` | `rift_heralds_killed` | INTEGER NULLABLE, CHECK >= 0 |
| `monstruos.void_grubs` | `void_grubs_killed` | INTEGER NULLABLE, CHECK >= 0 |
| `monstruos.elder_dragons` | `elder_dragons_killed` | INTEGER NULLABLE, CHECK >= 0 |
| `monstruos.objetivos_robados` | `objectives_stolen` | INTEGER NULLABLE, CHECK >= 0 |
| `monstruos.asistencias_robo` | `objectives_stolen_assists` | INTEGER NULLABLE, CHECK >= 0 |
| `gameplay.mayor_daño_habilidad` | `largest_ability_damage` | INTEGER NULLABLE, CHECK >= 0 |
| `gameplay.mayor_daño_ataque` | `largest_attack_damage` | INTEGER NULLABLE, CHECK >= 0 |
| `gameplay.mayor_critico` | `largest_critical_strike` | INTEGER NULLABLE, CHECK >= 0 |
| `gameplay.tiempo_vivo_mas_largo` | `longest_time_living` | INTEGER NULLABLE, CHECK >= 0 |
| `gameplay.tiempo_muerto` | `time_spent_dead` | INTEGER NULLABLE, CHECK >= 0 |

Las métricas avanzadas son campos enteros nullables con restricciones de comprobación `CHECK` para impedir números negativos. Un valor `NULL` preserva la ausencia de dicho dato en el origen, mientras que `0` representa un valor explícito registrado. El campo `is_mvp` es un valor booleano (por defecto `false`) cuya asignación depende de la organización arbitral de la liga y no se computa automáticamente desde el archivo de repetición.

---

## Inventario y Hechizos (`player_game_build`)

| Campo del Jugador en JSON | Columna SQL | Descripción |
| --- | --- | --- |
| `objetos.slots[0].id` | `item_0` | Objeto en slot 0 del inventario |
| `objetos.slots[1].id` | `item_1` | Objeto en slot 1 del inventario |
| `objetos.slots[2].id` | `item_2` | Objeto en slot 2 del inventario |
| `objetos.slots[3].id` | `item_3` | Objeto en slot 3 del inventario |
| `objetos.slots[4].id` | `item_4` | Objeto en slot 4 del inventario |
| `objetos.slots[5].id` | `item_5` | Objeto en slot 5 del inventario |
| `objetos.slots[6].id` | `trinket` | Objeto de visión (trinket / slot 6) |
| `hechizos.hechizo_1_id` | `summoner_spell_1_id` | Identificador del primer hechizo de invocador (D) |
| `hechizos.hechizo_2_id` | `summoner_spell_2_id` | Identificador del segundo hechizo de invocador (F) |

Los slots de inventario se indexan por la posición fija del slot (0 a 6), no por el orden en el que fueron adquiridos. Los contadores de lanzamientos de cada hechizo (`casts_1` y `casts_2`) se almacenan en `player_game_stats`.

---

## Configuración de Runas (`player_game_runes`)

| Campo del Jugador en JSON | Columna SQL | Descripción |
| --- | --- | --- |
| `runas.primaria.keystone_id` | `primary_keystone_id` | Identificador de la runa clave (Keystone) |
| `runas.primaria.estilo_id` | `primary_perk` | Rama o árbol de runas principal (Precisión, Dominación, etc.) |
| `runas.primaria.runa_1_id` | `primary_perk_1` | Primera runa menor de la rama primaria |
| `runas.primaria.runa_2_id` | `primary_perk_2` | Segunda runa menor de la rama primaria |
| `runas.primaria.runa_3_id` | `primary_perk_3` | Tercera runa menor de la rama primaria |
| `runas.secundaria.estilo_id` | `secundary_rune_id` | Rama o árbol de runas secundario |
| `runas.secundaria.runa_1_id` | `secundary_perk_1` | Primera runa menor de la rama secundaria |
| `runas.secundaria.runa_2_id` | `secundary_perk_2` | Segunda runa menor de la rama secundaria |
| `runas.fragmentos.ofensiva_id` | `stat_perk_offense` | Fragmento adaptativo de estadísticas ofensivas |
| `runas.fragmentos.flexible_id` | `stat_perk_flex` | Fragmento adaptativo de estadísticas flexibles |
| `runas.fragmentos.defensiva_id` | `stat_perk_defense` | Fragmento adaptativo de estadísticas defensivas |

---

## Verificación y Alcance de Pruebas

La suite de pruebas automatizadas en `tests/unit/database/roflStats.test.ts` aplica la migración consolidada del esquema, carga los datos del fixture y comprueba que las estadísticas del archivo real `apps/parser/result/EUW1-7982902321_estadisticas.json` se persisten e hidratan sin pérdidas en PostgreSQL embebido (PGlite).

* **Comportamiento del Parser Python (`roflParser.py`):**
  La función `player()` en `apps/parser/roflParser.py` extrae y devuelve explícitamente el campo `'resultado'` (`'Win'` o `'Lose'`), calculado a partir de la propiedad booleana `WIN` (`"resultado": "Win" if b(p.get("WIN")) else "Lose"`). Para los detalles técnicos del motor de extracción por seek inverso y las pruebas unitarias automatizadas del parser, consultar [Arquitectura del Extractor de Repeticiones ROFL](rofl-parser.md).
* **Múltiples Cuentas por Usuario:**
  El PUUID de Riot no actúa como identificador único global del participante en este modelo. Un mismo usuario de Discord puede tener asociadas múltiples cuentas de juego (`players`), identificándose la principal mediante la columna `players.is_main`.
* **Desacoplamiento del Ingestor:**
  El esquema relacional está completamente preparado para recibir volcados de repeticiones de juego. La vinculación automática entre los jugadores del archivo ROFL y las plantillas oficiales de los equipos federados se implementará en la fase de servicios de importación.
