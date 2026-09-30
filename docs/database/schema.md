# Catálogo de Esquema y Entidades Relacionales

[⬅️ Volver a Documentación de Base de Datos](./README.md) | [Siguiente: Restricciones y Disparadores ➡️](./constraints.md)

---

## 1. Tipos Enumerados (`pgEnum`)

La base de datos define exactamente **6 tipos enumerados (`pgEnum`)** en `packages/database/src/schema.ts:24-51` y en el DDL baseline `packages/database/drizzle/0000_initial_schema.sql:1-6`:

| Nombre TypeScript | Nombre PostgreSQL | Valores Permitidos | Ubicación `schema.ts` | Ubicación `0000_initial_schema.sql` |
|---|---|---|---|---|
| `appRole` | `app_role` | `'viewer'`, `'admin'`, `'owner'` | `schema.ts:24` | `0000_initial_schema.sql:1` |
| `gameSide` | `game_side` | `'blue'`, `'red'` | `schema.ts:25` | `0000_initial_schema.sql:2` |
| `stage` | `stage` | `'regular'`, `'playoff'` | `schema.ts:26` | `0000_initial_schema.sql:3` |
| `matchStatus` | `match_status` | `'scheduled'`, `'live'`, `'completed'`, `'cancelled'`, `'forfeit'` | `schema.ts:27-33` | `0000_initial_schema.sql:4` |
| `rosterRole` | `roster_role` | `'top'`, `'jungle'`, `'mid'`, `'adc'`, `'support'`, `'substitute'`, `'coach'`, `'staff'`, `'partners'` | `schema.ts:34-44` | `0000_initial_schema.sql:5` |
| `rosterMovementAction` | `roster_movement_action` | `'joined'`, `'left'`, `'promoted_to_captain'`, `'demoted_from_captain'`, `'role_changed'` | `schema.ts:45-51` | `0000_initial_schema.sql:6` |

### Especificaciones de Comportamiento:
- **`app_role`:** Incorpora el valor `'owner'` para distinguir la jerarquía superior del propietario del servidor de Discord frente a los administradores convencionales (`'admin'`) y espectadores (`'viewer'`). La inserción de cualquier valor no registrado es rechazada a nivel de motor de tipos de PostgreSQL.
- **`roster_role`:** Contiene 9 roles, pero solo las 5 posiciones competitivas (`'top'`, `'jungle'`, `'mid'`, `'adc'`, `'support'`) están autorizadas para ostentar la capitanía (`is_captain = true`) según la restricción `team_memberships_captain_role_check` (`schema.ts:230-233`). Los roles `'substitute'`, `'coach'`, `'staff'` y `'partners'` tienen prohibido ser capitanes de equipo.
- **`roster_movement_action`:** Audita las cinco transiciones de ciclo de vida de un miembro en una plantilla.

---

## 2. Catálogo Detallado de Tablas Relacionales

El modelo cuenta con exactamente **21 tablas** definidas con Drizzle ORM en `packages/database/src/schema.ts:53-692`.

---

### 2.1 `discord_users`
- **Ubicación:** `packages/database/src/schema.ts:53-61` | DDL: `0000_initial_schema.sql:7-15`.
- **Propósito:** Entidad raíz de identidad para usuarios autenticados mediante Discord OAuth2.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `discord_id` | `varchar(32)` | No | — | Clave primaria natural (copo de nieve / snowflake inmutable de Discord). |
  | `username` | `varchar(64)` | No | — | Nombre de usuario de Discord. |
  | `global_name` | `varchar(64)` | Sí | `NULL` | Nombre global o de visualización configurado en Discord. |
  | `avatar_hash` | `varchar(128)` | Sí | `NULL` | Hash del avatar proporcionado por el CDN de Discord. |
  | `role` | `public.app_role` | No | `'viewer'` | Nivel de permisos (`'viewer'`, `'admin'`, `'owner'`). |
  | `created_at` | `timestamptz` | No | `now()` | Fecha y hora de registro. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha y hora de última modificación (actualizada por disparador). |
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:390,395`).
- **Comportamiento Específico:** Un usuario puede no tener vinculada ninguna cuenta de jugador (`players`) o tener múltiples cuentas asociadas.

---

### 2.2 `auth_sessions`
- **Ubicación:** `packages/database/src/schema.ts:63-74` | DDL: `0000_initial_schema.sql:17-23`.
- **Propósito:** Sesiones de usuario activas y persistentes en el servidor.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `token_hash` | `varchar(64)` | No | — | Clave primaria. Digest SHA-256 del token de sesión de la cookie. |
  | `discord_user_id` | `varchar(32)` | No | — | Clave foránea hacia `discord_users.discord_id` (`ON DELETE CASCADE`). |
  | `expires_at` | `timestamptz` | No | — | Instante de expiración de la sesión. |
  | `created_at` | `timestamptz` | No | `now()` | Fecha de emisión. |
- **Índices:** `auth_sessions_expires_at_idx` en `expires_at` (`schema.ts:73`, `0000_initial_schema.sql:349`).
- **Comportamiento Específico:** Carece de columna `updated_at` y no forma parte del disparador `set_updated_at`. La eliminación de un usuario en `discord_users` purga inmediatamente todas sus sesiones activas en cascada.

---

### 2.3 `oauth_states`
- **Ubicación:** `packages/database/src/schema.ts:76-83` | DDL: `0000_initial_schema.sql:25-28`.
- **Propósito:** Protección contra ataques CSRF en el apretón de manos de autorización OAuth2 de Discord.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `token_hash` | `varchar(64)` | No | — | Clave primaria. Hash del estado aleatorio emitido al iniciar el flujo de login. |
  | `expires_at` | `timestamptz` | No | — | Instante límite para completar la autorización. |
- **Índices:** `oauth_states_expires_at_idx` en `expires_at` (`schema.ts:82`, `0000_initial_schema.sql:350`).
- **Comportamiento Específico:** Tabla efímera sin claves foráneas ni columna `updated_at`.

---

### 2.4 `audit_logs`
- **Ubicación:** `packages/database/src/schema.ts:85-107` | DDL: `0000_initial_schema.sql:30-40`.
- **Propósito:** Trazabilidad forense e inmutable de operaciones administrativas y modificaciones de datos.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada. |
  | `actor_discord_user_id` | `varchar(32)` | Sí | `NULL` | FK hacia `discord_users.discord_id` (`ON DELETE SET NULL`). |
  | `action` | `varchar(120)` | No | — | Identificador descriptivo de la operación ejecutada. |
  | `entity_type` | `varchar(64)` | No | — | Tipo de entidad afectada (ej. `'team'`, `'membership'`). |
  | `entity_id` | `uuid` | Sí | `NULL` | Identificador de la entidad afectada. |
  | `before` | `jsonb` | Sí | `NULL` | Estado previo a la mutación en formato JSONB. |
  | `after` | `jsonb` | Sí | `NULL` | Estado resultante tras la mutación en formato JSONB. |
  | `created_at` | `timestamptz` | No | `now()` | Instante del registro. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de última actualización. |
- **Índices:**
  - `audit_logs_entity_idx` en `(entity_type, entity_id)` (`schema.ts:104`, `0000_initial_schema.sql:347`).
  - `audit_logs_actor_discord_user_id_idx` en `actor_discord_user_id` (`schema.ts:105`, `0000_initial_schema.sql:348`).
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:393,395`).
- **Comportamiento Específico:** La clave foránea del actor usa `ON DELETE SET NULL` para preservar el registro histórico de auditoría incluso si la cuenta de Discord del administrador es eliminada.

---

### 2.5 `seasons`
- **Ubicación:** `packages/database/src/schema.ts:109-124` | DDL: `0000_initial_schema.sql:42-49`.
- **Propósito:** Catálogo maestro de temporadas de la competición.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `name` | `varchar(120)` | No | — | Clave primaria natural inmutable de la temporada (ej. `'Temporada 1'`). |
  | `starts_on` | `date` | Sí | `NULL` | Fecha de inicio programado. |
  | `ends_on` | `date` | Sí | `NULL` | Fecha de finalización programada. |
  | `created_at` | `timestamptz` | No | `now()` | Instante de creación. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Restricciones:**
  - CHECK `seasons_dates_check`: `"ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on"` (`schema.ts:119-122`, `0000_initial_schema.sql:48`).
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:390,395`).
- **Comportamiento Específico:** No dispone de columna `is_active` ni de disparador de temporada única activa, permitiendo la coexistencia de múltiples temporadas históricas o concurrentes sin bloqueos de estado global.

---

### 2.6 `divisions`
- **Ubicación:** `packages/database/src/schema.ts:126-131` | DDL: `0000_initial_schema.sql:51-56`.
- **Propósito:** Catálogo maestro de categorías o niveles competitivos (ej. `'Premier'`, `'Ascend'`).
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `name` | `varchar(80)` | No | — | Clave primaria natural (nombre de la división). |
  | `sort_order` | `smallint` | No | `0` | Criterio numérico de ordenación para visualización jerárquica. |
  | `created_at` | `timestamptz` | No | `now()` | Instante de registro. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:390,395`).
- **Comportamiento Específico:** El catálogo es transversal e independiente de las temporadas. Las divisiones se vinculan a las temporadas mediante `seasons_divisions`.

---

### 2.7 `seasons_divisions`
- **Ubicación:** `packages/database/src/schema.ts:133-157` | DDL: `0000_initial_schema.sql:58-65`.
- **Propósito:** Asociación M:N entre temporadas y divisiones; representa una liga o torneo específico.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada del torneo activo. |
  | `season_name` | `varchar(120)` | No | — | FK hacia `seasons.name` (`ON DELETE CASCADE`). |
  | `division_name` | `varchar(80)` | No | — | FK hacia `divisions.name` (`ON DELETE CASCADE`). |
  | `created_at` | `timestamptz` | No | `now()` | Instante de creación. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Restricciones de Unicidad:**
  - UNIQUE `seasons_divisions_season_division_key` en `(season_name, division_name)` (`schema.ts:153`, `0000_initial_schema.sql:64`).
- **Índices:**
  - `seasons_divisions_season_name_idx` en `season_name` (`schema.ts:154`, `0000_initial_schema.sql:351`).
  - `seasons_divisions_division_name_idx` en `division_name` (`schema.ts:155`, `0000_initial_schema.sql:352`).
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:390,395`).

---

### 2.8 `players`
- **Ubicación:** `packages/database/src/schema.ts:159-181` | DDL: `0000_initial_schema.sql:67-78`.
- **Propósito:** Cuentas de invocador de League of Legends asociadas a un usuario físico de Discord.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada. |
  | `discord_user_id` | `varchar(32)` | Sí | `NULL` | FK hacia `discord_users.discord_id` (`ON DELETE SET NULL`). |
  | `game_name` | `varchar(64)` | No | — | Nombre de invocador en League of Legends. |
  | `riot_tag` | `varchar(16)` | Sí | `NULL` | Etiqueta de Riot (TagLine, ej. `'EUW'`). |
  | `puuid` | `varchar(128)` | Sí | `NULL` | Identificador universal único de cuenta de Riot Games. |
  | `country_code` | `varchar(2)` | Sí | `NULL` | Código de país ISO 3166-1 alpha-2 de nacionalidad deportiva. |
  | `is_main` | `boolean` | No | `false` | Indica si es la cuenta de invocador principal del usuario. |
  | `created_at` | `timestamptz` | No | `now()` | Instante de registro. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Restricciones de Unicidad:**
  - UNIQUE `players_game_name_riot_tag_key` en `(game_name, riot_tag)` (`schema.ts:178`, `0000_initial_schema.sql:77`).
- **Índices:** `players_discord_user_id_idx` en `discord_user_id` (`schema.ts:179`, `0000_initial_schema.sql:354`).
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:390,395`).
- **Comportamiento Específico:** La columna `puuid` carece de restricción UNIQUE debido a que el sistema procesa repeticiones ROFL sin conexión en vivo con la API oficial de Riot, permitiendo gestionar inconsistencias entre versiones del cliente. Un usuario de Discord puede poseer múltiples perfiles de invocador.

---

### 2.9 `teams`
- **Ubicación:** `packages/database/src/schema.ts:183-206` | DDL: `0000_initial_schema.sql:80-93`.
- **Propósito:** Clubes y equipos inscritos en una edición concreta de una división y temporada.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada. |
  | `season_division_id` | `uuid` | No | — | FK hacia `seasons_divisions.id` (`ON DELETE CASCADE`). |
  | `name` | `varchar(120)` | No | — | Nombre oficial del club. |
  | `short_name` | `varchar(16)` | Sí | `NULL` | Siglas o acrónimo corto del equipo (ej. `'MAD'`). |
  | `logo_url` | `text` | Sí | `NULL` | URL del escudo o imagen corporativa. |
  | `color` | `varchar(7)` | Sí | `NULL` | Código de color hexadecimal para la interfaz web. |
  | `is_active` | `boolean` | No | `true` | Estado de actividad del equipo en la competición. |
  | `discord_role_id` | `bigint` | Sí | `NULL` | ID del rol de Discord asociado al equipo (modo `bigint`). |
  | `created_at` | `timestamptz` | No | `now()` | Instante de creación. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Restricciones de Unicidad:**
  - UNIQUE `teams_season_division_name_key` en `(season_division_id, name)` (`schema.ts:203`, `0000_initial_schema.sql:91`).
  - UNIQUE `teams_discord_role_id_unique` en `discord_role_id` (`schema.ts:193`, `0000_initial_schema.sql:92`).
- **Índices:** `teams_season_division_id_idx` en `season_division_id` (`schema.ts:204`, `0000_initial_schema.sql:353`).
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:390,395`).
- **Comportamiento Específico:** `discord_role_id` se define con `{ mode: 'bigint' }` en Drizzle para mapear directamente a `bigint` nativo de JavaScript, garantizando exactitud en identificadores de 19 dígitos. Admite múltiples valores nulos sin colisión de unicidad.

---

### 2.10 `team_memberships`
- **Ubicación:** `packages/database/src/schema.ts:208-240` | DDL: `0000_initial_schema.sql:95-104`.
- **Propósito:** Pertenencia de un usuario de Discord a la plantilla activa de un club.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `team_id` | `uuid` | No | — | Parte de la PK compuesta. FK hacia `teams.id` (`ON DELETE CASCADE`). |
  | `discord_user_id` | `varchar(32)` | No | — | Parte de la PK compuesta. FK hacia `discord_users.discord_id` (`ON DELETE CASCADE`). |
  | `role` | `public.roster_role` | No | — | Rol desempeñado en el equipo. |
  | `is_captain` | `boolean` | No | `false` | Indica si el usuario ejerce de capitán del club. |
  | `created_at` | `timestamptz` | No | `now()` | Fecha de incorporación. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Clave Primaria:** Compuesta `PRIMARY KEY (team_id, discord_user_id)` (`schema.ts:229`, `0000_initial_schema.sql:103`).
- **Restricciones y Checks:**
  - CHECK `team_memberships_captain_role_check`: `"is_captain" = false OR "role" IN ('top', 'jungle', 'mid', 'adc', 'support')` (`schema.ts:230-233`, `0000_initial_schema.sql:102`).
  - UNIQUE INDEX PARCIAL `team_memberships_unique_captain`: `UNIQUE (team_id) WHERE is_captain = true` (`schema.ts:236-238`, `0000_initial_schema.sql:360`).
- **Índices Adicionales:**
  - `team_memberships_team_id_idx` en `team_id` (`schema.ts:234`, `0000_initial_schema.sql:358`).
  - `team_memberships_discord_user_id_idx` en `discord_user_id` (`schema.ts:235`, `0000_initial_schema.sql:359`).
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:390,395`).
- **Comportamiento Específico:** Un equipo solo puede tener **un único capitán activo** simultáneamente gracias al índice parcial. Además, la plantilla pertenece a la identidad física del usuario (`discord_users`), lo que permite que un jugador cambie o actualice sus cuentas de invocador en `players` sin romper su pertenencia al equipo.

---

### 2.11 `roster_movements`
- **Ubicación:** `packages/database/src/schema.ts:242-275` | DDL: `0000_initial_schema.sql:106-115`.
- **Propósito:** Registro histórico inmutable de fichajes, salidas, capitanías y cambios de rol.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada. |
  | `team_id` | `uuid` | No | — | FK hacia `teams.id` (`ON DELETE CASCADE`). |
  | `discord_user_id` | `varchar(32)` | No | — | FK hacia `discord_users.discord_id` (`ON DELETE CASCADE`). |
  | `action` | `public.roster_movement_action` | No | — | Tipo de movimiento registrado. |
  | `role` | `public.roster_role` | Sí | `NULL` | Rol afectado en la transición. |
  | `actor_id` | `varchar(32)` | Sí | `NULL` | FK hacia `discord_users.discord_id` del administrador (`ON DELETE SET NULL`). |
  | `created_at` | `timestamptz` | No | `now()` | Instante del movimiento. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Índices:**
  - `roster_movements_team_id_idx` en `team_id` (`schema.ts:270`, `0000_initial_schema.sql:361`).
  - `roster_movements_discord_user_id_idx` en `discord_user_id` (`schema.ts:271`, `0000_initial_schema.sql:362`).
  - `roster_movements_actor_id_idx` en `actor_id` (`schema.ts:272`, `0000_initial_schema.sql:363`).
  - `roster_movements_created_at_idx` en `created_at` (`schema.ts:273`, `0000_initial_schema.sql:364`).
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:391,395`).
- **Comportamiento Específico:** El borrado del equipo o del usuario sujeto elimina sus movimientos en CASCADA; sin embargo, el borrado de la cuenta del administrador ejecutor (`actor_id`) ejecuta `SET NULL` para no alterar el historial del movimiento.

---

### 2.12 `rounds`
- **Ubicación:** `packages/database/src/schema.ts:277-297` | DDL: `0000_initial_schema.sql:117-126`.
- **Propósito:** Jornadas de competición por temporada y división.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `smallint` | No | — | Número ordinal correlativo de jornada (1, 2, ...). Parte de la PK compuesta. |
  | `id_season_division` | `uuid` | No | — | FK hacia `seasons_divisions.id` (`ON DELETE CASCADE`). Parte de la PK compuesta. |
  | `stage` | `public.stage` | No | `'regular'` | Fase competitiva (`'regular'`, `'playoff'`). |
  | `name` | `varchar(120)` | Sí | `NULL` | Etiqueta personalizada de la jornada (ej. `'Semana 1'`, `'Semifinales'`). |
  | `starts_at` | `timestamptz` | Sí | `NULL` | Fecha y hora límite de apertura de la jornada. |
  | `created_at` | `timestamptz` | No | `now()` | Instante de creación. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Clave Primaria:** Compuesta `PRIMARY KEY (id, id_season_division)` (`schema.ts:294`, `0000_initial_schema.sql:125`).
- **Índices:** `rounds_season_division_idx` en `id_season_division` (`schema.ts:295`, `0000_initial_schema.sql:365`).
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:391,395`).
- **Comportamiento Específico:** El identificador `id` no es único globalmente; representa el número de jornada local acotado por cada torneo o división (`id_season_division`).

---

### 2.13 `matches`
- **Ubicación:** `packages/database/src/schema.ts:299-361` | DDL: `0000_initial_schema.sql:128-155`.
- **Propósito:** Enfrentamientos entre dos clubes (series BO1, BO3 o BO5).
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada. |
  | `id_season_division` | `uuid` | No | — | FK hacia `seasons_divisions.id` (`ON DELETE CASCADE`). |
  | `id_round` | `smallint` | Sí | `NULL` | Parte de la FK compuesta hacia `rounds(id, id_season_division)`. |
  | `team1_id` | `uuid` | No | — | FK hacia `teams.id` (`ON DELETE CASCADE`). |
  | `team2_id` | `uuid` | No | — | FK hacia `teams.id` (`ON DELETE CASCADE`). |
  | `best_of` | `smallint` | No | `1` | Formato de la serie (`1`, `3` o `5`). |
  | `status` | `public.match_status` | No | `'scheduled'` | Estado (`'scheduled'`, `'live'`, `'completed'`, `'cancelled'`, `'forfeit'`). |
  | `scheduled_at` | `timestamptz` | Sí | `NULL` | Fecha y hora programada. |
  | `finished_at` | `timestamptz` | Sí | `NULL` | Fecha y hora de finalización. |
  | `winner_team_id` | `uuid` | Sí | `NULL` | FK hacia `teams.id` (`ON DELETE SET NULL`). |
  | `team1_score` | `smallint` | No | `0` | Mapas ganados por el equipo 1. |
  | `team2_score` | `smallint` | No | `0` | Mapas ganados por el equipo 2. |
  | `stream_url` | `text` | Sí | `NULL` | Enlace permanente a la retransmisión (VOD). |
  | `stream_url_live` | `varchar(255)` | Sí | `NULL` | Enlace directo a la emisión en directo (Twitch / YouTube). |
  | `notes` | `text` | Sí | `NULL` | Observaciones arbitrales o disciplinarias. |
  | `jornada` | `integer` | Sí | `NULL` | Campo auxiliar de compatibilidad de jornada. |
  | `discord_channel_id` | `bigint` | Sí | `NULL` | ID del canal o hilo de Discord del partido (modo `bigint`). |
  | `created_at` | `timestamptz` | No | `now()` | Instante de creación. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Claves Foráneas:**
  - `(id_round, id_season_division)` -> `rounds(id, id_season_division)` ON DELETE SET NULL (`schema.ts:351-355`, `0000_initial_schema.sql:153`).
- **Restricciones de Unicidad:**
  - UNIQUE `matches_unique_combination` en `(id_season_division, id_round, team1_id, team2_id)` (`schema.ts:343`, `0000_initial_schema.sql:152`).
  - UNIQUE `matches_discord_channel_id_unique` en `discord_channel_id` (`schema.ts:318`, `0000_initial_schema.sql:154`).
- **Checks:**
  - `matches_different_teams_check`: `"team1_id" <> "team2_id"`.
  - `matches_best_of_check`: `"best_of" IN (1, 3, 5)`.
  - `matches_scores_check`: `"team1_score" >= 0 AND "team2_score" >= 0`.
  - `matches_winner_participant_check`: `"winner_team_id" IS NULL OR "winner_team_id" IN ("team1_id", "team2_id")`.
- **Índices:**
  - `matches_season_division_scheduled_at_idx` en `(id_season_division, scheduled_at)`.
  - `matches_round_idx` en `(id_round, id_season_division)`.
  - `matches_team1_id_idx` en `team1_id`.
  - `matches_team2_id_idx` en `team2_id`.
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:391,395`).
- **Comportamiento Específico:** El ganador (`winner_team_id`) no puede ser cualquier equipo arbitrario; la restricción garantiza que solo puede ser `team1_id` o `team2_id`.

---

### 2.14 `match_games`
- **Ubicación:** `packages/database/src/schema.ts:363-411` | DDL: `0000_initial_schema.sql:157-174`.
- **Propósito:** Mapas o partidas individuales disputadas dentro de una serie o encuentro (`matches`).
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada. |
  | `matches_id` | `uuid` | No | — | FK hacia `matches.id` (`ON DELETE CASCADE`). |
  | `game_number` | `smallint` | No | — | Número de mapa en la serie (1, 2, ...). |
  | `blue_team_id` | `uuid` | No | — | FK hacia `teams.id` (`ON DELETE CASCADE`). |
  | `red_team_id` | `uuid` | No | — | FK hacia `teams.id` (`ON DELETE CASCADE`). |
  | `winner_team_id` | `uuid` | Sí | `NULL` | FK hacia `teams.id` (`ON DELETE CASCADE`). |
  | `duration_seconds` | `integer` | Sí | `NULL` | Duración del mapa en segundos. |
  | `external_game_id` | `varchar(128)` | Sí | `NULL` | ID externo de la partida (ej. MatchID de Riot o hash de repetición). |
  | `created_at` | `timestamptz` | No | `now()` | Instante de inserción. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Restricciones de Unicidad:**
  - UNIQUE `match_games_matches_id_game_number_unique` en `(matches_id, game_number)`.
  - UNIQUE `match_games_external_game_id_key` en `external_game_id`.
- **Checks:**
  - `match_games_different_teams_check`: `"blue_team_id" <> "red_team_id"`.
  - `match_games_number_check`: `"game_number" > 0`.
  - `match_games_duration_check`: `"duration_seconds" IS NULL OR "duration_seconds" > 0`.
  - `match_games_winner_participant_check`: `"winner_team_id" IS NULL OR "winner_team_id" IN ("blue_team_id", "red_team_id")`.
- **Índices:**
  - `match_games_matches_id_idx` en `matches_id`.
  - `match_games_blue_team_id_idx` en `blue_team_id`.
  - `match_games_red_team_id_idx` en `red_team_id`.
- **Disparadores:**
  - `set_updated_at` (`0000_initial_schema.sql:391,395`).
  - `check_match_games_teams_trigger`: BEFORE INSERT OR UPDATE ON `match_games` (`0000_initial_schema.sql:422-424`).
- **Comportamiento Específico:** El disparador `check_match_games_teams()` valida que los equipos del lado azul y rojo pertenezcan obligatoriamente a `{matches.team1_id, matches.team2_id}` del partido padre, arrojando excepción `23514` en caso de discrepancia.

---

### 2.15 `player_game_info`
- **Ubicación:** `packages/database/src/schema.ts:413-447` | DDL: `0000_initial_schema.sql:176-187`.
- **Propósito:** Registro padre de participación de un jugador en una partida concreta.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria raíz de la instantánea de participación. |
  | `match_game_id` | `uuid` | No | — | FK hacia `match_games.id` (`ON DELETE CASCADE`). |
  | `player_id` | `uuid` | No | — | FK hacia `players.id` (`ON DELETE RESTRICT`). |
  | `team_id` | `uuid` | No | — | FK hacia `teams.id` (`ON DELETE RESTRICT`). |
  | `side` | `public.game_side` | No | — | Lado del mapa (`'blue'`, `'red'`). |
  | `champion` | `varchar(64)` | No | — | Campeón seleccionado. |
  | `position` | `varchar(64)` | Sí | `NULL` | Línea de juego (TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY). |
  | `created_at` | `timestamptz` | No | `now()` | Instante de creación. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Restricciones de Unicidad:**
  - UNIQUE `player_game_info_match_game_player_key` en `(match_game_id, player_id)`.
- **Índices:**
  - `player_game_info_match_game_id_idx` en `match_game_id`.
  - `player_game_info_player_id_idx` en `player_id`.
  - `player_game_info_team_id_idx` en `team_id`.
- **Disparadores:**
  - `set_updated_at` (`0000_initial_schema.sql:391,395`).
  - `complete_player_game`: Disparador de restricción diferido (`0000_initial_schema.sql:451-454`).
- **Comportamiento Específico:** `player_id` y `team_id` usan `ON DELETE RESTRICT` para blindar los datos históricos, impidiendo borrar perfiles de jugador o equipos si poseen participaciones en partidas registradas.

---

### 2.16 `player_game_build`
- **Ubicación:** `packages/database/src/schema.ts:449-472` | DDL: `0000_initial_schema.sql:189-202`.
- **Propósito:** Equipamiento de objetos y hechizos de invocador utilizados en la partida (relación 1:1).
- **Columnas (12):**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción |
  |---|---|---|---|---|
  | `id` | `uuid` | No | — | PK que es FK hacia `player_game_info.id` (`ON DELETE CASCADE`). |
  | `item_0` | `integer` | No | `0` | ID del objeto en ranura 0. |
  | `item_1` | `integer` | No | `0` | ID del objeto en ranura 1. |
  | `item_2` | `integer` | No | `0` | ID del objeto en ranura 2. |
  | `item_3` | `integer` | No | `0` | ID del objeto en ranura 3. |
  | `item_4` | `integer` | No | `0` | ID del objeto en ranura 4. |
  | `item_5` | `integer` | No | `0` | ID del objeto en ranura 5. |
  | `trinket` | `integer` | No | `0` | ID de la baratija / tótem de visión. |
  | `summoner_spell_1_id` | `integer` | Sí | `NULL` | ID del primer hechizo de invocador. |
  | `summoner_spell_2_id` | `integer` | Sí | `NULL` | ID del segundo hechizo de invocador. |
  | `created_at` | `timestamptz` | No | `now()` | Instante de creación. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Disparadores:**
  - `set_updated_at` (`0000_initial_schema.sql:392,395`).
  - `complete_player_game` constraint trigger diferido.
- **Comportamiento Específico:** No dispone de generador independiente de UUID; adopta como clave primaria el identificador de `player_game_info`.

---

### 2.17 `player_game_runes`
- **Ubicación:** `packages/database/src/schema.ts:474-499` | DDL: `0000_initial_schema.sql:204-219`.
- **Propósito:** Árbol de runas principales, secundarias y fragmentos de estadísticas (relación 1:1).
- **Columnas (14):**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción |
  |---|---|---|---|---|
  | `id` | `uuid` | No | — | PK que es FK hacia `player_game_info.id` (`ON DELETE CASCADE`). |
  | `primary_keystone_id` | `integer` | No | — | Rama de runa primaria. |
  | `secundary_rune_id` | `integer` | No | — | Rama de runa secundaria. |
  | `primary_perk` | `integer` | No | — | Runa clave principal. |
  | `primary_perk_1` | `integer` | No | — | Runa menor primaria 1. |
  | `primary_perk_2` | `integer` | No | — | Runa menor primaria 2. |
  | `primary_perk_3` | `integer` | No | — | Runa menor primaria 3. |
  | `secundary_perk_1` | `integer` | No | — | Runa menor secundaria 1. |
  | `secundary_perk_2` | `integer` | No | — | Runa menor secundaria 2. |
  | `stat_perk_offense` | `integer` | No | — | Fragmento ofensivo. |
  | `stat_perk_flex` | `integer` | No | — | Fragmento flexible. |
  | `stat_perk_defense` | `integer` | No | — | Fragmento defensivo. |
  | `created_at` | `timestamptz` | No | `now()` | Instante de creación. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Disparadores:**
  - `set_updated_at` (`0000_initial_schema.sql:392,395`).
  - `complete_player_game` constraint trigger diferido.
- **Comportamiento Específico:** Los 11 campos de configuración de runas son `NOT NULL` sin valor por defecto; si el archivo ROFL no contiene la configuración de runas, la transacción no puede completarse.

---

### 2.18 `player_game_stats`
- **Ubicación:** `packages/database/src/schema.ts:501-598` | DDL: `0000_initial_schema.sql:221-302`.
- **Propósito:** Métricas de rendimiento deportivo (KDA, oro, daño, visión y 30+ estadísticas avanzadas ROFL) (relación 1:1).
- **Columnas Principales (43 columnas en total):**
  - Identidad: `id` (PK y FK hacia `player_game_info.id` ON DELETE CASCADE).
  - Básicas: `kills`, `deaths`, `assists`, `cs`, `damage_to_champions` (todas `smallint`/`integer` NOT NULL DEFAULT 0).
  - Reconocimiento: `is_mvp` (`boolean` NOT NULL DEFAULT `false`).
  - Visión y Objetivos: `vision_score`, `wards_placed`, `wards_destroyed`, `control_wards_purchased`, `detector_wards_placed`, `dragons_killed`, `barons_killed`, `void_grubs_killed`, `elder_dragons_killed`, `objectives_stolen`, `turrets_killed`, `inhibitors_killed`.
  - Combate Avanzado: `double_kills`, `triple_kills`, `quadra_kills`, `penta_kills`, `largest_killing_spree`, `damage_taken_from_champions`, `damage_mitigated`, `crowd_control_time`, `largest_critical_strike`, `longest_time_living`, `time_spent_dead`, `gold_earned`, `level`.
  - Auditoría: `created_at`, `updated_at`.
- **Checks:**
  - `player_game_stats_non_negative_check`: Kills, deaths, assists, cs y daño deben ser `>= 0`.
  - `player_game_stats_vision_check`: `vision_score IS NULL OR vision_score >= 0`.
  - `player_game_stats_rofl_non_negative_check`: Las 32 métricas avanzadas deben ser `>= 0` si no son `NULL`.
- **Disparadores:**
  - `set_updated_at` (`0000_initial_schema.sql:391,395`).
  - `complete_player_game` constraint trigger diferido.

---

### 2.19 `predictions`
- **Ubicación:** `packages/database/src/schema.ts:600-632` | DDL: `0000_initial_schema.sql:304-315`.
- **Propósito:** Pronósticos deportivos emitidos por la comunidad para los partidos oficiales.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada. |
  | `discord_user_id` | `varchar(32)` | No | — | FK hacia `discord_users.discord_id` (`ON DELETE CASCADE`). |
  | `match_id` | `uuid` | No | — | FK hacia `matches.id` (`ON DELETE CASCADE`). |
  | `selected_team_id` | `uuid` | No | — | FK hacia `teams.id` (`ON DELETE RESTRICT`). |
  | `home_score` | `smallint` | Sí | `NULL` | Marcador estimado del primer equipo. |
  | `away_score` | `smallint` | Sí | `NULL` | Marcador estimado del segundo equipo. |
  | `created_at` | `timestamptz` | No | `now()` | Instante de emisión. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de modificación. |
- **Restricciones de Unicidad:**
  - UNIQUE `predictions_user_match_key` en `(discord_user_id, match_id)` (`schema.ts:628`, `0000_initial_schema.sql:313`).
- **Índices:**
  - `predictions_match_id_idx` en `match_id`.
  - `predictions_discord_user_id_idx` en `discord_user_id`.
- **Disparadores:** `set_updated_at` (`0000_initial_schema.sql:392,395`).
- **Comportamiento Específico:** Un usuario solo puede emitir exactamente un pronóstico por partido. Modificar el pronóstico debe realizarse vía `UPDATE`.

---

### 2.20 `home_weekly_teams`
- **Ubicación:** `packages/database/src/schema.ts:633-666` | DDL: `0000_initial_schema.sql:334-345`.
- **Propósito:** Selección editorial del "Equipo de la Semana" (Dream Team) publicado en la portada.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada. |
  | `division_id` | `uuid` | No | — | FK hacia `seasons_divisions.id` (`ON DELETE CASCADE`). |
  | `round_id` | `smallint` | Sí | `NULL` | Parte de la FK compuesta hacia `rounds(id, id_season_division)`. |
  | `label` | `varchar(120)` | No | — | Título del quinteto (ej. `'Semana 3 - Premier'`). |
  | `published` | `boolean` | No | `false` | Visibilidad pública en la portada. |
  | `players` | `jsonb` | No | — | Array estructurado JSONB con los 5 jugadores seleccionados. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de última edición. |
- **Claves Foráneas:**
  - `(round_id, division_id)` -> `rounds(id, id_season_division)` ON DELETE CASCADE.
- **Restricciones de Unicidad:**
  - UNIQUE `home_weekly_teams_division_round_key` en `(division_id, round_id)` (`schema.ts:659`, `0000_initial_schema.sql:344`).
- **Comportamiento Específico:** Esta tabla **carece de columna `created_at`** y **NO está incluida en el disparador automático `set_updated_at`**. Cualquier actualización debe asignar explícitamente `updated_at` a nivel de aplicación u ORM. El array `players` está tipado en TypeScript para garantizar la presencia de roles competitivos (`'top'`, `'jungle'`, `'mid'`, `'adc'`, `'support'`).

---

### 2.21 `editorial_articles`
- **Ubicación:** `packages/database/src/schema.ts:668-692` | DDL: `0000_initial_schema.sql:316-333`.
- **Propósito:** Gestor de artículos informativos y noticias para la portada web.
- **Columnas:**
  | Columna | Tipo SQL | Nulable | Valor por Defecto | Descripción y Restricciones |
  |---|---|---|---|---|
  | `id` | `uuid` | No | `gen_random_uuid()` | Clave primaria subrogada. |
  | `title` | `varchar(180)` | No | — | Titular del artículo. |
  | `excerpt` | `varchar(500)` | No | — | Resumen para tarjetas y previsualizaciones. |
  | `body` | `text` | No | — | Contenido completo en Markdown o texto plano. |
  | `kind` | `varchar(20)` | No | — | Tipo de contenido (`'noticia'`, `'reportaje'`, `'entrevista'`, `'otro'`). |
  | `author` | `varchar(120)` | No | — | Firma del redactor o autor. |
  | `cover_url` | `text` | No | `''` | URL de la imagen de cabecera. |
  | `cover_alt` | `varchar(240)` | No | `''` | Texto alternativo de accesibilidad. |
  | `published` | `boolean` | No | `false` | Estado de publicación. |
  | `show_on_home` | `boolean` | No | `false` | Fijar como destacado en la página de inicio. |
  | `home_order` | `integer` | No | `0` | Orden de visualización en la portada. |
  | `published_at` | `timestamptz` | Sí | `NULL` | Fecha de publicación oficial. |
  | `updated_at` | `timestamptz` | No | `now()` | Fecha de última edición. |
- **Checks:**
  - `editorial_kind_check`: `"kind" IN ('noticia', 'reportaje', 'entrevista', 'otro')`.
  - `editorial_order_check`: `"home_order" >= 0`.
- **Índices:** `editorial_home_idx` en `(published, show_on_home, home_order)` (`schema.ts:688`, `0000_initial_schema.sql:378`).
- **Comportamiento Específico:** Carece de columna `created_at` y no forma parte del disparador `set_updated_at`. `cover_url` y `cover_alt` utilizan cadenas vacías `''` por defecto en lugar de `NULL` para evitar validaciones condicionales nulas en los componentes frontend.
