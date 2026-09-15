# Modelo PostgreSQL: Referencia y Decisiones Arquitectónicas

La fuente de verdad del esquema vigente es `packages/database/drizzle/0000_initial_schema.sql`, sincronizada con `packages/database/src/schema.ts` y el snapshot de Drizzle ORM. Contiene las 17 tablas del sistema. El archivo `docs/reference/0000_initial_schema.original.sql` se conserva únicamente como referencia histórica del diseño previo.

Para la referencia exhaustiva del modelo relacional, diagramas y operaciones, consulta los documentos complementarios:
- [**Diagrama ER, Enumeraciones y Restricciones**](database-schema.md): Diagrama Mermaid ER de las 17 tablas, 6 enums del sistema, restricciones `CHECK` e índices únicos parciales.
- [**Operaciones, Concurrencia y Comandos**](database-operations.md): Bloqueos consultivos (`pg_advisory_lock`, `pg_advisory_xact_lock`), configuración del pool de conexiones, variables de entorno y comandos CLI (`db:migrate`, `db:seed`, etc.).
- [**Mapeo de Estadísticas ROFL**](rofl-mapping.md): Correspondencia detallada de métricas JSON de repeticiones hacia tablas relacionales.

---

## Relaciones Principales

```text
seasons → seasons_divisions ← divisions
             ├─ teams ← team_memberships ← discord_users → players
             │    ├─ roster_movements ← discord_users
             └─ rounds → matches → match_games → player_game_info
discord_users → predictions → matches               ├─ player_game_stats (1:1)
                                                   ├─ player_game_runes (1:1)
                                                   └─ player_game_build (1:1)
discord_users → audit_logs
```

* **Separación de Identidades:** Usuarios Discord (`discord_users`) y jugadores (`players`) no son la misma entidad: un espectador puede emitir pronósticos sin ser jugador, y un jugador puede competir en la liga sin disponer de una cuenta de Discord vinculada.
* **Jerarquía de Competición:** Temporadas (`seasons`) y divisiones (`divisions`) se identifican naturalmente por `name`. La tabla intermedia `seasons_divisions` asigna un UUID primario que vincula a ambas y actúa como raíz para equipos (`teams`), jornadas (`rounds`) y partidos (`matches`).
* **Plantillas y Capitanía:** `team_memberships` emplea la clave primaria compuesta (`team_id`, `discord_user_id`), admite como máximo un único capitán por equipo mediante índice único parcial, y permite a un usuario poseer múltiples cuentas asociadas en `players` mediante el flag `is_main`. El historial de transiciones y cambios de rol se preserva en `roster_movements`.
* **Estructura de Partidos:** `rounds` utiliza clave compuesta (`id smallint`, `id_season_division uuid`) con fase `stage` enum (`'regular'`, `'playoff'`). `matches` enfrenta a `team1_id` y `team2_id`, y cada mapa individual se registra en `match_games` vinculado por `matches_id`.
* **Pronósticos:** Se gestionan en `predictions` con unicidad por usuario y partido (`discord_user_id`, `match_id`).

---

## Decisiones de Diseño y Correcciones del Esquema

Respecto a la especificación inicial preliminar, se aplicaron correcciones arquitectónicas indispensables para garantizar la integridad referencial y el rendimiento del motor relacional:

| Deficiencia Original | Corrección Implementada en el Baseline |
| --- | --- |
| Claves foráneas hacia tablas aún no creadas y errores de sintaxis SQL | Generación ordenada y determinista de DDL mediante Drizzle Kit con resolución topológica de dependencias. |
| Referencias circulares: `info` apuntaba a `stats`/`runes`/`build` y estas apuntaban a `info` | Modelado jerárquico 1:1 estricto: las tablas hijas (`stats`, `runes`, `build`) usan su `id` como PK y FK en cascada hacia `player_game_info.id`, eliminando columnas redundantes del padre. |
| Claves UUID independientes generadas con `DEFAULT` en tablas hijas | El `id` de cada tabla hija coincide exactamente con el `id` de su registro padre en `player_game_info`. |
| Índices y restricciones `UNIQUE` de `stats` referenciaban columnas inexistentes en esa tabla | Se reubicaron en `player_game_info`, donde residen `match_game_id`, `player_id` y `team_id`. |
| Triggers sintácticamente incorrectos (`BEFORE UPDATE ON *`) | Se crearon triggers individuales específicos por tabla para invocar `set_updated_at()`, incluyendo `audit_logs`. |
| Validación de temporada activa mediante trigger con `SELECT` previo (vulnerable a condiciones de carrera concurrentes) | Reemplazado por índice único parcial `seasons_one_active_key` a nivel de catálogo de PostgreSQL. |
| Desalineación de `schema.ts` respecto al modelo relacional | ORM tipado 100% alineado con `0000_initial_schema.sql` y snapshots de migraciones. |
| Ausencia de campos de visión y estadísticas de repetición | Inclusión de `vision_score` y 33 métricas avanzadas ROFL con validaciones de no negatividad (`CHECK`). |

### Atomicidad de Snapshots de Participación
Los tres registros hijos (`player_game_stats`, `player_game_runes`, `player_game_build`) son de existencia obligatoria para cada `player_game_info` al confirmar la transacción. El sistema implementa un constraint trigger diferido (`complete_player_game` con `DEFERRABLE INITIALLY DEFERRED`), permitiendo insertar en primer lugar la cabecera `player_game_info` y seguidamente sus tres tablas dependientes. Si alguna de las tres no se inserta antes del `COMMIT`, el motor revierte la transacción automáticamente. Asimismo, la eliminación del registro en `player_game_info` borra en cascada sus tres hijas, mientras que el borrado aislado de una tabla hija es rechazado por el trigger.

### Generación de Identificadores
El esquema emplea la función nativa `gen_random_uuid()` de PostgreSQL moderno, prescindiendo de dependencias o extensiones externas como `pgcrypto`.

---

## Estadísticas y Adaptación de Partidas

El almacenamiento de estadísticas descompone la información del mapa en participación (`player_game_info`), métricas (`player_game_stats`), runas (`player_game_runes`) y objetos/hechizos (`player_game_build`).

* **Distinción entre Nulo y Cero:** Los campos numéricos de métricas avanzadas son `INTEGER` o `SMALLINT` nullables. Un valor `NULL` representa dato desconocido o no capturado; un valor `0` representa un registro explícito de cero unidades (ej. cero muertes o cero centinelas colocados).
* **Consistencia de Unidades:** Se respetan los valores numéricos y unidades directas del parser de repeticiones sin conversiones artificiales ni suposiciones de eventos no presentes en el archivo.
* **Documentación de Mapeo:** La equivalencia exacta entre las propiedades extraídas del JSON de repetición y las columnas del esquema relacional se encuentra documentada en [`docs/architecture/rofl-mapping.md`](rofl-mapping.md).

---

## Reglas de Clasificación (Standings)

La clasificación de una división se calcula dinámicamente a partir de los partidos con estado `status IN ('completed', 'forfeit')` que cuenten con un ganador registrado (`winner_team_id IS NOT NULL`), acotados por la división (`id_season_division`) y la fase de la ronda (`rounds.stage = 'regular'`).

* **Segregación de Fases:** Por defecto solo se computan los partidos de fase regular (`stage = 'regular'`). Los enfrentamientos de playoff no contaminan la clasificación general de la división.
* **Partidos no Asignados:** Los partidos sin jornada asignada (`id_round IS NULL`) quedan fuera del cómputo hasta que se vinculen a una ronda específica.
* **Criterio de Ordenación y Desempate:**
  1. Victorias en partidos (`matches won`) DESC.
  2. Derrotas en partidos (`matches lost`) ASC.
  3. Diferencia de mapas (`game differential = map_wins - map_losses`) DESC.
  4. Nombre del equipo (`team name`) ASC (orden determinista de desempate técnico; no constituye una regla deportiva de liga definitiva).

Las reglas oficiales de desempate federadas o particulares de la liga permanecen pendientes de formalización reglamentaria.

---

## Alcance de las Garantías y Reglas Pendientes

* **Garantías Validadas en Base de Datos:**
  El motor relacional garantiza claves foráneas, restricciones de unicidad, valores no negativos, pertenencia del ganador a los equipos participantes y atomicidad de snapshots 1:1.
* **Validaciones Delegadas al Servicio de Ingesta:**
  El futuro servicio de importación de repeticiones o actas deberá validar que ambos equipos pertenezcan a la división, que los lados correspondan a la serie, la presencia de diez jugadores elegibles en plantilla histórica y la coherencia del formato Bo1/Bo3/Bo5.
* **Pick'em y Autorización:**
  El cierre temporal de pronósticos por fecha de inicio de partido y los permisos de usuario corresponden a capas de aplicación posteriores. La presencia de la tabla `predictions` en el baseline proporciona soporte de esquema, pero no presupone la lógica de negocio final implementada.
* **Advertencia de Cascada en `matches_round_fkey`:**
  La clave foránea compuesta `matches_round_fkey` (`matches(id_round, id_season_division)` hacia `rounds(id, id_season_division)`) declara `ON DELETE SET NULL`. Sin embargo, la columna `matches.id_season_division` está tipada como `NOT NULL`. En consecuencia, si se intenta eliminar una jornada (`rounds`) que esté referenciada por partidos existentes, la operación fallará a nivel de motor. Esta regla se conserva deliberadamente del modelo inicial recibido; cualquier modificación futura requerirá decidir si se desvincula únicamente `id_round` o si se establece explícitamente una restricción `ON DELETE RESTRICT`.

---

## Fuentes Técnicas de Referencia

- [Drizzle ORM: Generación y Snapshots](https://orm.drizzle.team/docs/drizzle-kit-generate)
- [Drizzle ORM: Migraciones en Node-Postgres](https://orm.drizzle.team/docs/migrations)
- [PGlite: PostgreSQL Embebido en Memoria](https://pglite.dev/docs/about)
