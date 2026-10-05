# Persistencia Transaccional ACID y Base de Datos

[⬅️ Volver a API ROFL Upload](README.md) | [Siguiente: Validaciones ➡️](validation.md)

---

## 1. Visión General

La persistencia de repeticiones ROFL en la base de datos PostgreSQL está encapsulada en la clase `PostgresRoflUploadRepository` (`apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts`). Este componente garantiza la atomicidad estricta de las operaciones de inserción, la eliminación de condiciones de carrera mediante bloqueos pesimistas a nivel de fila y el cumplimiento de las restricciones relacionales y disparadores (*triggers*) deportivos del monorepo.

---

## 2. Búsqueda y Resolución Insensible a Mayúsculas

Los invocadores pueden escribir su Riot ID combinando mayúsculas y minúsculas de manera heterogénea en diferentes entornos o herramientas. Para garantizar que la búsqueda sea determinista y libre de duplicidades:

```typescript
// postgres-rofl-upload.repository.ts:43-72
export async function findPlayersByRiotIds(
  db: Database,
  riotIds: Array<{ gameName: string; riotTag: string }>
): Promise<PlayerLookupResult[]> {
  // Realiza innerJoin con discordUsers
  // Aplica sql`LOWER(${players.gameName}) = LOWER(${r.gameName})`
  // y sql`LOWER(${players.riotTag}) = LOWER(${r.riotTag})`
}
```
Esto permite resolver el `id` UUID de `players` y el `discordUserId` asociado sin importar si el `.rofl` reporta `Faker#KR1`, `faker#kr1` o `FAKER#KR1`.

---

## 3. Resolución de Partido y Ventana Semanal ($\pm 9$ Días)

Para asociar una partida individual de una repetición a su serie oficial en la competición (`findMatchForTeams`, `postgres-rofl-upload.repository.ts:99-178`):
1. **Búsqueda Directa por Estado:** Primero busca si existe un partido entre ambos equipos en estado `'scheduled'` o `'live'` (`postgres-rofl-upload.repository.ts:106-122`).
2. **Búsqueda por Ventana de Jornada Semanal:** Si no hay ningún partido abierto en curso pero se dispone de la fecha de la partida (`gameDate`):
   - El sistema calcula el lunes de la semana de la jornada y evalúa un margen de tolerancia temporal de **$\pm 9$ días** (`postgres-rofl-upload.repository.ts:125-175`).
   - Admite partidos que hayan sido disputados de forma anticipada o postergada por común acuerdo de los equipos, asociando automáticamente la repetición al partido oficial más cercano en el calendario.

---

## 4. Transacción Atómica y Bloqueo Pesimista de Filas

Todas las partidas del lote se insertan dentro de una **única transacción de base de datos** (`await this.db.transaction(async (tx) => { ... })`, `postgres-rofl-upload.repository.ts:257`).

### 4.1 Bloqueo Pesimista (`SELECT ... FOR UPDATE`)
En series al mejor de 3 (Bo3) o al mejor de 5 (Bo5), dos administradores o procesos podrían subir concurrentemente repeticiones de diferentes juegos de la misma serie. Para erradicar colisiones de clave única en `(matches_id, game_number)`:
```typescript
// apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:376-390
const [matchRow] = await tx
  .select()
  .from(matches)
  .where(eq(matches.id, matchId))
  .for('update');

if (!matchRow) {
  throw new Error(`Match ${matchId} not found in database`);
}
if (matchRow.status === 'completed') {
  if (await registeredMeanwhile(game.externalGameId)) {
    skippedDuplicates.push(game.externalGameId);
    continue;
  }
  throw new Error(`Match ${matchId} is already completed/closed`);
}
```
El bloqueo pesimista `for('update')` asegura que la fila del partido queda bloqueada exclusivamente para esta transacción. Las demás transacciones concurrentes deben esperar en la base de datos hasta que se determine `nextGameNumber` y se confirmen las inserciones, serializando matemáticamente la asignación de números de juego.

### 4.2 Comprobación Idempotente de Duplicados
Una partida es duplicada si su `externalGameId` ya está registrado en `match_games` o ya apareció antes en el mismo lote. Toda partida duplicada se agrega a `skippedDuplicates` y se omite sin arrojar excepción, sin consumir número de juego y sin modificar los marcadores; el resto del lote se inserta con normalidad. `skippedDuplicates` es el único mecanismo para informar de duplicados.

La detección se hace en tres puntos, todos dentro de la transacción:

1. **Lectura inicial dentro de la transacción** (`postgres-rofl-upload.repository.ts:258-259`): `checkExternalGamesExist(externalIds, tx)` consulta todos los identificadores del lote con el ejecutor de la transacción. Una subida concurrente que ya confirmó la misma partida queda reflejada en esta lectura.
2. **Inserción con `ON CONFLICT (external_game_id) DO NOTHING`** (`postgres-rofl-upload.repository.ts:415-433`): si otra subida confirma la misma partida después de la lectura inicial, la restricción única `match_games_external_game_id_key` (`packages/database/src/schema.ts:399`) resuelve la carrera. La inserción usa `.returning()`; si no devuelve filas, la partida se informa como duplicada y no se insertan sus filas hijas. El conflicto se limita a `external_game_id`: una colisión en `(matches_id, game_number)` sigue siendo un error.
3. **Partido ya cerrado** (`postgres-rofl-upload.repository.ts:364-368` y `384-390`): si la otra subida completó el partido con esa misma partida, la resolución de la serie lo encuentra cerrado antes de llegar a la inserción. Antes de rechazar el lote por partido cerrado, `registeredMeanwhile` vuelve a consultar el `externalGameId` dentro de la transacción; si ya existe, la partida se trata como duplicada.

Antes de este diseño la comprobación se hacía fuera de la transacción: dos subidas simultáneas con una partida común pasaban ambas la comprobación y la segunda se revertía entera con un error de clave única.

---

## 5. Inserción Multi-Fila en las 5 Tablas Relacionales

Para maximizar el rendimiento y reducir las idas y vueltas a la base de datos (*round-trips*), los datos se acumulan en matrices y se insertan en lote dentro de la transacción (`postgres-rofl-upload.repository.ts:339-421`):

1. **`match_games`:** Inserción del encabezado de la partida (`id: matchGameId`, `gameNumber: nextGameNumber`, `blueTeamId`, `redTeamId`, `winnerTeamId`, `durationSeconds`, `externalGameId`).
2. **`player_game_info` (10 filas):** Inserción de los 10 registros de participación vinculados a `matchGameId`. Cada fila recibe un identificador único generado `infoId = crypto.randomUUID()`.
3. **`player_game_stats` (10 filas):** Inserción multi-fila de las 40 métricas de combate compartiendo la clave `id: infoId`.
4. **`player_game_runes` (10 filas):** Inserción multi-fila de la estructura completa de runas compartiendo la clave `id: infoId`.
5. **`player_game_build` (10 filas):** Inserción multi-fila del inventario de 7 objetos y hechizos compartiendo la clave `id: infoId`.

---

## 6. Disparadores SQL y Restricciones de Integridad

El esquema relacional cuenta con procedimientos almacenados en PostgreSQL (`packages/database/drizzle/0000_initial_schema.sql:410-455`):

### 6.1 Disparador `check_match_games_teams`
Disparado en `BEFORE INSERT OR UPDATE ON match_games`:
- Valida que `blue_team_id` y `red_team_id` pertenezcan obligatoriamente a los dos equipos participantes del partido padre (`team1_id` o `team2_id` en `matches`). De lo contrario, arroja error SQL `23514` (*Check Violation*): `'Blue and red teams must belong to the parent match'`.

### 6.2 Disparador Diferido de Restricción `complete_player_game`
Declarado sobre las tablas `player_game_info`, `player_game_stats`, `player_game_runes` y `player_game_build`:
```sql
CREATE CONSTRAINT TRIGGER complete_player_game
AFTER INSERT OR UPDATE ON player_game_info
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION require_complete_player_game();
```
- **Integridad Atómica Garantizada:** Este disparador exige que al realizar el `COMMIT` final de la transacción existan obligatoriamente los registros correspondientes en las 4 tablas para cada `info.id`. Si falta alguna de las 3 tablas hijas, la transacción completa se revierte con código de error SQL `23514`: `'Incomplete player game snapshot'`.
- **Flexibilidad Transaccional:** Al ser `INITIALLY DEFERRED`, la aplicación Node.js puede insertar las tablas en cualquier secuencia lógica dentro del bloque transaccional sin riesgo de bloqueos por claves foráneas inmediatas.

---

## 7. Cierre Automático de Serie y Marcadores

Tras insertar las partidas del lote, el repositorio evalúa la situación competitiva de la serie (`postgres-rofl-upload.repository.ts:424-453`):
- Actualiza `team1Score` y `team2Score`.
- Calcula el umbral matemático de victoria:
  $$\text{winThreshold} = \lfloor \text{bestOf} / 2 \rfloor + 1$$
  - En un Bo3: $\lfloor 3 / 2 \rfloor + 1 = 2$ victorias requeridas.
  - En un Bo5: $\lfloor 5 / 2 \rfloor + 1 = 3$ victorias requeridas.
- Si un equipo alcanza el umbral de victoria:
  - Transiciona el estado de `matches` de `'live'` a `'completed'`.
  - Asigna `winnerTeamId` al equipo ganador de la serie.
  - Establece `finishedAt = new Date()`.
