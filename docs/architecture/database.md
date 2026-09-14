# Modelo PostgreSQL: referencia y correcciones

La fuente vigente es `packages/database/drizzle/0000_initial_schema.sql`, editada por el usuario y sincronizada con schema.ts y el snapshot de Drizzle. Contiene 16 tablas. `docs/reference/0000_initial_schema.original.sql` es únicamente una referencia histórica.

## Relaciones

```text
seasons → seasons_divisions ← divisions
             ├─ teams ← team_memberships ← discord_users → players
             └─ rounds → matches → match_games → player_game_info
discord_users → predictions → matches               ├─ player_game_stats (1:1)
                                                   ├─ player_game_runes (1:1)
                                                   └─ player_game_build (1:1)
discord_users → audit_logs
```

Usuarios Discord y jugadores no son la misma entidad: un espectador puede pronosticar sin ser jugador, y un jugador puede existir sin cuenta vinculada.

Temporadas y divisiones se identifican por name; seasons_divisions tiene UUID y vincula ambas. discord_users usa discord_id como PK. Las plantillas usan la PK compuesta (team_id, discord_user_id), admiten un capitán por equipo y un usuario puede tener varias cuentas players, con is_main. rounds usa (id smallint, id_season_division) y stage es un enum. matches usa team1_id/team2_id y match_games referencia la serie mediante matches_id. Los pronósticos están en predictions; no existen tablas de bonus.

## Correcciones necesarias

| Original | Implementación |
| --- | --- |
| FK hacia tablas aún no creadas, coma ausente y comas sobrantes | SQL generado por Drizzle con tablas y FK ordenadas |
| info apunta a stats/runes/build y estas vuelven a info | Hijas con PK=FK hacia info; se eliminan runes_id/build_id/stats_id del padre |
| DEFAULT UUID independiente en IDs de hijas | El ID de cada hija se recibe del padre |
| UNIQUE e índices de stats referencian match_game_id/player_id/team_id inexistentes | Se sitúan en player_game_info, donde están esas columnas |
| BEFORE UPDATE ON * | Un trigger por tabla, incluido audit_logs |
| Trigger de temporada activa con SELECT previo | Índice único parcial; seguro frente a inserciones concurrentes |
| Schema.ts tenía slugs, editor y no incluía las tablas nuevas | ORM alineado al SQL de referencia corregido |
| No existe visión en el SQL | El baseline unificado incluye vision_score nullable con CHECK no negativo |

Los tres registros hijos son obligatorios al confirmar la transacción. Los constraint triggers diferidos permiten insertar info y luego sus hijos; si falta alguno, COMMIT falla y revierte todo. Borrar info elimina sus hijos en cascada. Borrar solo una hija falla. No se cambia la identidad de un snapshot para asignarlo a otro jugador.

El SQL usa gen_random_uuid() de PostgreSQL moderno; no necesita instalar pgcrypto para generar UUID. Se añade validación de fechas de temporada y de ganador perteneciente a los dos participantes.

## Runas y objetos

Se conservan los nombres originales, incluida la grafía secundary. Para la futura adaptación del JSON ROFL se propone:

| SQL | Campo del parser |
| --- | --- |
| primary_keystone_id | runas.primaria.keystone_id |
| primary_perk | runas.primaria.estilo_id |
| primary_perk_1/2/3 | runas.primaria.runa_1/2/3_id |
| secundary_rune_id | runas.secundaria.estilo_id |
| secundary_perk_1/2 | runas.secundaria.runa_1/2_id |
| stat_perk_offense/flex/defense | runas.fragmentos.ofensiva/flexible/defensiva_id |
| item_0…item_5 / trinket | objetos.slots 0…5 / 6 |
| vision_score | vision.score |

Este mapeo se documenta como interpretación de los nombres ambiguos, antes de implementar el importador. En esta entrega no se ingiere el ROFL ni se vinculan automáticamente sus jugadores con equipos de liga.

NULL en visión y en las nuevas métricas significa desconocido; cero significa que se registró cero. El baseline incorpora los campos de oro, multikills, daño recibido/mitigado, estructuras, wards, objetivos, lanzamientos de hechizos y gameplay del parser. Los IDs de hechizos están en player_game_build; la posición por mapa está en player_game_info y el PUUID opcional, sin UNIQUE, en players. El mapeo completo está en rofl-mapping.md. Se conservan los valores numéricos y unidades del parser; no se inventan timelines ni baneos.

## Clasificación

Se deriva de matches completed/forfeit con ganador, acotados por división y fase de rounds. Por defecto solo regular; playoffs no contaminarán la tabla regular. Partidos sin jornada quedan fuera hasta ser asignados a una fase.

Se conserva el orden de la web anterior: victorias DESC, derrotas ASC, diferencia de mapas DESC, nombre ASC. El nombre solo proporciona un orden determinista; no es una regla deportiva nueva. Las reglas oficiales de desempate siguen pendientes de confirmación.

## Alcance de las garantías

La base valida FK, unicidad, valores no negativos definidos, ganadores participantes y snapshots completos. El futuro servicio de importación deberá validar que ambos equipos y jornada pertenecen a la división, coherencia de los lados con la serie, diez jugadores, elegibilidad de plantilla histórica y resultado Bo1/Bo3/Bo5. No hay todavía rutas de escritura expuestas.

El cierre por fecha de Pick'em y la autorización son reglas de la siguiente fase. Que predictions tenga fixtures no significa que ese flujo esté implementado.

Advertencia del SQL actual: matches_round_fkey declara ON DELETE SET NULL para ambas columnas, pero id_season_division es NOT NULL. Borrar una jornada referenciada fallará. Se conserva esta regla del modelo recibido; cambiarla requiere decidir si se desvincula únicamente id_round o se impide explícitamente el borrado.

## Fuentes técnicas

- [Drizzle: generación y snapshots](https://orm.drizzle.team/docs/drizzle-kit-generate).
- [Drizzle: migraciones](https://orm.drizzle.team/docs/migrations).
- [PGlite: PostgreSQL embebido para las pruebas](https://pglite.dev/docs/about).
