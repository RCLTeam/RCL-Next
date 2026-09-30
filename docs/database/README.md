# Capa de Base de Datos y Arquitectura Relacional

[⬅️ Volver al Índice Principal de Documentación](../../docs/README.md) | [Siguiente: ROFL Replay Pipeline ➡️](../rofl/README.md)

---

## 1. Resumen Ejecutivo

La capa de persistencia de RCL-Next está construida sobre **PostgreSQL 16+** (y compatible con **PGlite 0.3+** en memoria para pruebas de integración), modelada y tipada en tiempo de compilación mediante **Drizzle ORM** (`packages/database/src/schema.ts`).

La arquitectura relacional implementa un diseño de alta integridad deportiva que desacopla la identidad del usuario en Discord de sus perfiles de invocador en League of Legends, soporta múltiples divisiones y temporadas concurrentes sin cuellos de botella de estado global, y garantiza la coherencia atómica de estadísticas de partidas mediante procedimientos almacenados y disparadores PL/pgSQL transaccionales y diferidos.

---

## 2. Principios de Diseño Relacional

1. **Claves Primarias Naturales e Inmutables:** Se evitan identificadores subrogados artificiales (UUIDs) donde existen entidades con identidad canónica externa globalmente única (copos de nieve de Discord en `discord_users.discord_id`, nombres normalizados en `seasons.name` y `divisions.name`).
2. **Claves Primarias Compuestas:** Se aplican en tablas intermedias y relaciones acotadas (`team_memberships` sobre `(team_id, discord_user_id)` y `rounds` sobre `(id, id_season_division)`), eliminando duplicidades a nivel de índice de clave primaria.
3. **Jerarquía 1:1 de Instantáneas de Partida:** La participación de un jugador (`player_game_info`) actúa como entidad raíz compartiendo su identificador primario con sus desgloses complementarios (`player_game_stats`, `player_game_runes`, `player_game_build`), sincronizados mediante un disparador de restricción diferido (`complete_player_game`).
4. **Protección de Precisión Numérica (BigInt):** Los identificadores de Discord de 64 bits (`discord_role_id` en `teams` y `discord_channel_id` en `matches`) se gestionan en modo `bigint` nativo, previniendo la pérdida de precisión en números de coma flotante de JavaScript (límite `Number.MAX_SAFE_INTEGER` de 53 bits).
5. **Concurrencia Segura y Protección en Producción:** Las migraciones y la siembra de datos operan bajo bloqueos consultivos de PostgreSQL (`pg_advisory_lock`), garantizando serialización ante múltiples instancias del backend o trabajadores de CI/CD.

---

## 3. Tabla de Contenidos del Módulo

| Documento | Descripción |
|---|---|
| [schema.md](./schema.md) | Catálogo detallado de las 21 tablas Drizzle y 6 tipos enumerados (`pgEnum`), especificación de columnas, tipos, claves y nulabilidad. |
| [constraints.md](./constraints.md) | Restricciones relacionales, índices únicos parciales, reglas de validación `CHECK` y disparadores PL/pgSQL (`set_updated_at`, `check_match_games_teams`, `complete_player_game`). |
| [migrations.md](./migrations.md) | Ciclo de vida de migraciones con Drizzle Kit, ejecutor programático con bloqueo consultivo `72160419` y verificación de integridad criptográfica SHA-256. |
| [seed.md](./seed.md) | Estrategia de siembra transaccional protegida con bloqueo `72160420`, fixtures sintéticos deterministas (`demo.sql`) y conjunto de datos de demostración con 240 estadísticas (`showcase.sql`). |
| [contracts.md](./contracts.md) | Integración y trazabilidad entre las entidades relacionales de la base de datos y los contratos TypeScript compartidos del paquete `@rcl/contracts`. |

---

## 4. Referencia Histórica

Para consultar la evolución arquitectónica respecto al diseño preliminar monolítico, ver:
- [docs/reference/README.md](../reference/README.md): Comparativa técnica detallada entre el esquema histórico `0000_initial_schema.original.sql` y el modelo relacional actual.
