# Mapeo de estadísticas del JSON ROFL al baseline

La migración 0000 contiene el esquema completo. Mantiene las tablas de participación, estadísticas, runas y build separadas; las métricas se guardan por jugador y mapa, no como acumulados en players.

## Identificación

| JSON | Destino |
| --- | --- |
| nombre / tag | players.game_name / riot_tag |
| puuid | players.puuid (opcional, único; varchar, no UUID PostgreSQL) |
| posicion | player_game_info.position (valor reportado, independiente del rol de plantilla) |
| campeon | player_game_info.champion |
| equipo | Traducir 100/200 a side blue/red y al UUID de equipo seleccionado |
| riot_id | Derivable de nombre y tag |
| resultado | Derivable del ganador del mapa y del equipo del jugador |
| partida.duracion | match_games.duration_seconds |
| partida.equipo_ganador | Traducir 100/200 al UUID de equipo en match_games.winner_team_id |

Los metadatos del archivo (fuente, game_length_raw, chunks y keyframes) no son estadísticas individuales y no se añaden a players. Los resúmenes de equipo se derivan; los créditos individuales de objetivos no deben interpretarse automáticamente como objetivos únicos de equipo.

## player_game_stats

| Campo del jugador en JSON | Columna SQL |
| --- | --- |
| kda.kills / muertes / asistencias | kills / deaths / assists |
| cs | cs |
| daño_campeones | damage_to_champions |
| vision.score | vision_score |
| kda.double_kills | double_kills |
| kda.triple_kills | triple_kills |
| kda.quadra_kills | quadra_kills |
| kda.penta_kills | penta_kills |
| kda.largest_killing_spree | largest_killing_spree |
| oro | gold_earned |
| nivel | level |
| daño_recibido_campeones | damage_taken_from_champions |
| soporte.daño_mitigado | damage_mitigated |
| soporte.control_adversarios | crowd_control_time |
| estructuras.torres | turrets_killed |
| estructuras.derribos_torres | turret_takedowns |
| estructuras.inhibidores | inhibitors_killed |
| estructuras.derribos_inhibidores | inhibitor_takedowns |
| vision.wards_colocados | wards_placed |
| vision.wards_destruidos | wards_destroyed |
| vision.pinkwards_comprados | control_wards_purchased |
| vision.wards_detector | detector_wards_placed |
| pings | pings |
| hechizos.casts_1 | summoner_spell_1_casts |
| hechizos.casts_2 | summoner_spell_2_casts |
| monstruos.dragones | dragons_killed |
| monstruos.barones | barons_killed |
| monstruos.heraldos | rift_heralds_killed |
| monstruos.void_grubs | void_grubs_killed |
| monstruos.elder_dragons | elder_dragons_killed |
| monstruos.objetivos_robados | objectives_stolen |
| monstruos.asistencias_robo | objectives_stolen_assists |
| gameplay.mayor_daño_habilidad | largest_ability_damage |
| gameplay.mayor_daño_ataque | largest_attack_damage |
| gameplay.mayor_critico | largest_critical_strike |
| gameplay.tiempo_vivo_mas_largo | longest_time_living |
| gameplay.tiempo_muerto | time_spent_dead |

Las nuevas métricas son INTEGER nullable con CHECK no negativo. NULL conserva la ausencia de un dato; 0 es un valor explícito. Se almacenan las unidades que entrega el parser, sin conversión inventada. El parser actual normaliza numerosos campos ausentes a 0: esa distinción de origen no puede recuperarse desde su JSON. is_mvp sigue siendo una decisión de la liga, no se deduce automáticamente.

## player_game_build

Se mantienen item_0…item_5 y trinket, mapeados por el número de slot, no por el orden del array. Se añaden summoner_spell_1_id y summoner_spell_2_id desde hechizos.hechizo_1_id/hechizo_2_id. Los contadores casts_1/casts_2 se guardan en estadísticas.

## player_game_runes

No necesita nuevas columnas. El mapeo de estilo, keystone, runas secundarias y fragmentos está descrito en database.md y comprobado con los diez jugadores del JSON.

## Verificación y alcance

test/rofl-stats.test.ts aplica el baseline, carga fixtures y escribe las métricas del JSON EUW1-7982902321_estadisticas.json en PostgreSQL embebido. Comprueba su lectura sin pérdidas, rechaza métricas negativas y distingue NULL de cero.

La estructura está preparada para el volcado; todavía no hay endpoint/importador de ROFL que asigne jugadores y equipos reales. El parser Python presenta una modificación local: player() no devuelve resultado, aunque team() lo consulta. No se ha sobrescrito esa modificación; el test utiliza el JSON existente.
