# Datos de Siembra, Fixtures y Conjuntos de Demostración

[⬅️ Volver a Documentación de Base de Datos](./README.md) | [Siguiente: Contratos TypeScript y DTOs ➡️](./contracts.md)

---

## 1. Arquitectura de Siembra de Datos

La carga de datos iniciales y fixtures para entornos locales y pruebas automatizadas se gestiona mediante el ejecutor `packages/database/src/seed.ts` y dos archivos SQL deterministas ubicados en `packages/database/seed/`:
- `demo.sql` (169 LoC): Estructura base de competición con divisiones, clubes, miembros, jornadas y partidos programados.
- `showcase.sql` (1022 LoC): Datos extendidos con 240 registros completos de estadísticas de partida (`player_game_stats`) en 24 mapas de series competitivas.

---

## 2. Protección Estricta de Entornos de Producción

Para prevenir la inyección accidental de datos ficticios en entornos productivos, el ejecutor evalúa variables de entorno antes de interactuar con el motor:

```typescript
// packages/database/src/seed.ts:6-10
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error(
    'Demo seed disabled. Set ALLOW_DEMO_SEED=true in a development/test environment only.'
  );
}
```

### Reglas de Ejecución:
1. Si `NODE_ENV === 'production'`, la ejecución falla de manera inmediata con excepción explícita.
2. Si la variable `ALLOW_DEMO_SEED` no está explícitamente establecida en `'true'`, la siembra se cancela.

---

## 3. Bloqueo Transaccional Consultivo (`pg_advisory_xact_lock`)

La siembra de datos opera dentro de una transacción única de PostgreSQL protegida por un bloqueo consultivo transaccional:

```typescript
// packages/database/src/seed.ts:16-21
await client.query('BEGIN');
await client.query('SELECT pg_advisory_xact_lock(72160420)');
await client.query(script);
await client.query(showcase);
await client.query('COMMIT');
```

### Características del Bloqueo Transaccional:
- **Identificador Único:** `72160420`.
- **Ámbito Transaccional:** A diferencia de `pg_advisory_lock`, `pg_advisory_xact_lock` se libera automáticamente al cerrarse la transacción (`COMMIT` o `ROLLBACK`).
- **Atomicidad Total:** Si cualquier instrucción de `demo.sql` o `showcase.sql` falla, se ejecuta `ROLLBACK` y la base de datos permanece en su estado original sin datos huérfanos o corruptos.

---

## 4. Estructura de `seed/demo.sql`: Fixtures Deterministas

El archivo `packages/database/seed/demo.sql` define identificadores canónicos deterministas mediante espacios de nombres prefijados en formato UUID v4:

| Prefijo Canónico | Entidad | Ejemplo de Identificador | Propósito |
|---|---|---|---|
| `9000...` | `discord_users` | `900000000000000001` (Snowflake) | Usuarios de prueba con roles `viewer`, `admin` y `owner`. |
| `2000...` | `seasons_divisions` | `20000000-0000-0000-0000-000000000001` | Ligas Premier y Ascend para la "Temporada DEMO". |
| `3000...` | `teams` | `30000000-0000-0000-0000-000000000001` | Equipos participantes (ej. "RCL Legends", "Nexus Tigers"). |
| `4000...` | `players` | `40000000-0000-0000-0000-000000000001` | Cuentas de invocador vinculadas a los usuarios de Discord. |
| `7000...` | `matches` | `70000000-0000-0000-0000-000000000001` | Encuentros de liga en formato BO1, BO3 y BO5. |
| `8000...` | `match_games` | `80000000-0000-0000-0000-000000000001` | Partidas o mapas individuales disputados. |
| `a000...` | `player_game_*` | `a0000000-0000-0000-0000-000000000001` | Identificador compartido entre `info`, `stats`, `runes` y `build`. |

### Idempotencia con `ON CONFLICT DO NOTHING`:
Todas las sentencias de inserción en `demo.sql` utilizan cláusulas `ON CONFLICT (...) DO NOTHING`, lo que permite re-ejecutar el script sobre una base de datos parcialmente poblada sin arrojar colisiones de clave primaria o índices únicos.

---

## 5. Estructura de `seed/showcase.sql`: Simulación Deportiva Completa

El archivo `packages/database/seed/showcase.sql` genera una simulación exhaustiva de partidos de alto nivel competitivo:
- **Volumen:** 24 mapas de series competitivas (BO3 y BO5) con exactamente 10 jugadores por mapa, sumando **240 registros completos** en `player_game_info`, `player_game_stats`, `player_game_runes` y `player_game_build`.
- **Estados de Partido Diversos:** Incluye series completadas (`'completed'`), una serie en directo (`'live'`) y un enfrentamiento cancelado (`'cancelled'`).

### Invariantes de Integridad Verificados:
La suite de pruebas automatizadas `tests/integration/demo-showcase.test.ts` certifica matemáticamente las siguientes reglas sobre el showcase:
1. **Completitud:** Cero valores `NULL` en las 43 columnas de `player_game_stats`.
2. **Equilibrio de Kills y Deaths:** En cada mapa individual, la suma total de asesinatos (`sum(kills)`) coincide exactamente con la suma total de muertes (`sum(deaths)`).
3. **Consistencia de Marcadores:** La cantidad de mapas ganados por cada equipo coincide exactamente con los marcadores `team1_score` y `team2_score` del partido padre en `matches`.
4. **Plantilla Completa:** Exactamente 10 jugadores por cada partida (5 en el bando azul y 5 en el bando rojo).

### Patrón Defensivo `coalesce` en Actualizaciones:
En las líneas 985 a 1021 de `showcase.sql`, las sentencias de actualización de estadísticas emplean la función `coalesce`:
```sql
UPDATE player_game_stats
SET gold_earned = coalesce(gold_earned, 15420),
    cs = coalesce(cs, 245)
WHERE id = 'a0000000-0000-0000-0000-000000000001';
```
- **Propósito:** Si una prueba o desarrollador modifica manualmente un valor estadístico en la base de datos local (ej. asignando `gold_earned = 99999` para probar la interfaz web), la re-ejecución del script preserva el valor modificado sin sobrescribirlo.
