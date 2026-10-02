# Referencia y Comparativa del Esquema Histórico

[⬅️ Volver a Documentación de Base de Datos](../database/README.md) | [Siguiente: Pipeline ROFL ➡️](../rofl/README.md)

---

## 1. Contexto y Propósito del Módulo de Referencia

Este directorio conserva como activo arqueológico el archivo `0000_initial_schema.original.sql` (283 LoC). Dicho archivo representa el diseño relacional preliminar previo a la reestructuración del monorepo RCL-Next y a la migración definitiva a Drizzle ORM.

El presente documento analiza las deficiencias arquitectónicas del esquema histórico y las decisiones de ingeniería que fundamentaron la adopción del modelo actual (`packages/database/src/schema.ts` y `packages/database/drizzle/0000_initial_schema.sql`).

---

## 2. Matriz Comparativa: Esquema Histórico vs Esquema Actual

| Dimensión Arquitectónica | Esquema Histórico (`0000_initial_schema.original.sql`) | Esquema Actual (`packages/database/src/schema.ts`) | Justificación Técnica del Cambio |
|---|---|---|---|
| **Claves Primarias en Entidades Naturales** | Identificadores UUID subrogados en `discord_users`, `seasons` y `divisions` (`:10, 20, 31`). | Claves primarias naturales: `discord_id`, `seasons.name`, `divisions.name` (`schema.ts:54, 112, 127`). | Elimina la sobrecarga de generar y consultar UUIDs artificiales en entidades cuya identidad externa es intrínsecamente única y canónica (ej. copos de nieve de Discord). |
| **Claves Primarias en Relaciones Intermedias** | Identificadores UUID subrogados en `team_memberships` y `rounds` (`:66, 79`). | Claves primarias compuestas: `PRIMARY KEY (team_id, discord_user_id)` y `PRIMARY KEY (id, id_season_division)` (`schema.ts:229, 294`). | Evita duplicidades de membresía o jornadas a nivel de clave primaria sin necesidad de índices únicos artificiales adicionales. |
| **Control de Temporada Activa** | Columna `is_active boolean` en `seasons` gobernada por el disparador PL/pgSQL `trigger_check_single_active_season` (`:14, 260-282`). | Columna `is_active` eliminada de `seasons`. Sin disparador de exclusividad. | El disparador histórico impedía mantener múltiples temporadas activas o consultar torneos paralelos. En el modelo actual, la propiedad `is_active` reside exclusivamente en `teams`. |
| **Catálogo de Divisiones** | Cada división pertenecía rígidamente a una única temporada (`season_id uuid REFERENCES seasons(id)`) (`:21`). | Catálogo maestro de `divisions(name)` asociado mediante la tabla intermedia `seasons_divisions`. | En el histórico, las divisiones morían al concluir la temporada. En el modelo actual, categorías como "Premier" o "Ascend" son entidades maestras reutilizables en múltiples ediciones. |
| **Pertenencia a Equipos** | Vinculaba la plantilla a la cuenta de invocador: `player_id uuid REFERENCES players(id)` (`:68`). | Vincula la plantilla al usuario físico: `discord_user_id varchar(32) REFERENCES discord_users(discord_id)` (`schema.ts:212`). | Una persona física puede cambiar o actualizar sus cuentas de invocador en League of Legends (`players`) sin perder su posición, capitanía o historial en el club. |
| **Estructura 1:1 de Instantánea de Partida** | `player_game_info` contenía claves foráneas salientes hacia `runes_id`, `build_id` y `stats_id` (`:137-139`). | `player_game_info.id` actúa como clave raíz; `stats.id`, `runes.id` y `build.id` son PKs que son a su vez FKs hacia `info.id` (`ON DELETE CASCADE`). | Inversión de dependencias que resolvió referencias circulares en el histórico. Se complementa con el disparador de restricción diferido `complete_player_game` para garantizar completitud al `COMMIT`. |
| **Nomenclatura en Series** | `home_team_id`, `away_team_id`, `home_score`, `away_score` (`:95, 96, 102, 103`). | `team1_id`, `team2_id`, `team1_score`, `team2_score` (`schema.ts:305, 306, 312, 313`). | Neutralidad deportiva indispensable para series competitivas al mejor de (BO3 / BO5) donde los lados de mapa van alternándose. |
| **Telemetría ROFL** | 6 columnas básicas en `player_game_stats` (`:146-151`). | 43 columnas con 30+ métricas avanzadas (visión, objetivos de mapa, daño desglosado, tiempos de muerte). | Soporte exhaustivo para la ingestión y análisis profundo de archivos de repetición ROFL. |
| **Sintaxis de Disparador Temporal** | Sintaxis inválida en PostgreSQL: `CREATE TRIGGER ... BEFORE UPDATE ON *` (`:256`). | Bucle dinámico procedural: `FOREACH table_name IN ARRAY ... LOOP EXECUTE format(...)` (`0000_initial_schema.sql:386-398`). | Corrección sintáctica para que el DDL sea ejecutable en motores PostgreSQL y entornos PGlite en memoria. |
| **Módulos de Seguridad y CMS** | Inexistentes en el esquema original. | Incorporación de `auth_sessions`, `oauth_states`, `audit_logs`, `roster_movements`, `home_weekly_teams`, `editorial_articles`. | Cobertura integral de flujos OAuth2 seguros, sesiones en base de datos, auditoría forense y gestión de contenidos de portada. |

---

## 3. Conclusión de la Evaluación de Referencia

El esquema original de `0000_initial_schema.original.sql` adolecía de tres problemas críticos:
1. **Fragilidad de Integridad:** La relación entre `player_game_info` y sus tres componentes hijas generaba dependencias circulares que dificultaban inserciones transaccionales limpias.
2. **Limitación Operativa:** El bloqueo de una sola temporada activa impedía la gestión de datos históricos y torneos paralelos.
3. **Sobrecarga de Identidad:** El uso indiscriminado de UUIDs artificiales en entidades con claves naturales únicas introducía costes innecesarios de almacenamiento e indexación.

El modelo actual documentado en [docs/database/](../database/README.md) resuelve integralmente estas deficiencias, garantizando una arquitectura de persistencia robusta, tipada y de alto rendimiento.
