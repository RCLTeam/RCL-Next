# Persistencia y Consultas Relacionales (Drizzle ORM)

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Validación ➡️](validation.md)

---

## 1. Visión General

La persistencia de datos del motor de competición reside en la clase `PostgresCompetitionRepository` (`apps/api/src/modules/competition/postgres-competition.repository.ts:1-458`), implementando la interfaz abstracta `CompetitionRepository`. 

El repositorio interactúa con la base de datos PostgreSQL mediante **Drizzle ORM**, consumiendo el esquema canónico definido en `packages/database/src/schema.ts`. No ejecuta consultas SQL crudas en cadenas abiertas; emplea constructores tipados (`select`, `innerJoin`, `leftJoin`, `where`, `orderBy`) asegurando tipado estricto en tiempo de compilación.

---

## 2. Diagrama de Relaciones y Entidades Clave

Las consultas del motor de competición navegan a través de la siguiente jerarquía de claves foráneas:

```
seasons (name PK)
  └── seasons_divisions (id UUID PK, season_name FK, division_name FK)
        ├── divisions (name PK, sort_order)
        ├── teams (id UUID PK, season_division_id FK)
        │     └── team_memberships (team_id FK, discord_user_id FK)
        ├── rounds (id smallint, id_season_division FK, stage, starts_at)
        └── matches (id UUID PK, id_season_division FK, id_round FK, team1_id FK, team2_id FK)
              └── match_games (id UUID PK, matches_id FK, game_number, winner_team_id)
                    ├── player_game_info (id UUID PK, match_game_id FK, player_id FK, team_id FK)
                    ├── player_game_stats (id UUID PK/FK -> player_game_info.id)
                    ├── player_game_build (id UUID PK/FK -> player_game_info.id)
                    └── player_game_runes (id UUID PK/FK -> player_game_info.id)
```

---

## 3. Hermetismo de Datos y Purga Activa de Privacidad

En cumplimiento de los estándares de seguridad de datos y privacidad de los participantes de RCL, el repositorio implementa una política estricta de exclusión de datos sensibles antes de proyectar cualquier registro al servicio:

### 3.1 Purga de Metadatos de Partida (`postgres-competition.repository.ts:77-94`)
Al consultar las estadísticas detalladas de los jugadores en un mapa (`matchGames`), se realiza una desestructuración intencionada para eliminar identificadores primarios y marcas de tiempo del sistema:
```typescript
const { id: statsId, createdAt: statsCreated, updatedAt: statsUpdated, ...stats } = getTableColumns(playerGameStats);
const { id: buildId, createdAt: buildCreated, updatedAt: buildUpdated, ...build } = getTableColumns(playerGameBuild);
const { id: runesId, createdAt: runesCreated, updatedAt: runesUpdated, ...runes } = getTableColumns(playerGameRunes);
```
Esto garantiza que los objetos `stats`, `build` y `runes` transmitidos al cliente contengan únicamente métricas del juego (KDA, daño, objetos, runas) y ninguna columna técnica de infraestructura.

### 3.2 Purga de Identificadores Sensibles del Jugador (`postgres-competition.repository.ts:145-152`)
La proyección base de jugadores selecciona exclusivamente:
```typescript
private playerSelection = {
  id: players.id,
  gameName: players.gameName,
  riotTag: players.riotTag,
  countryCode: players.countryCode,
  isMain: players.isMain,
  displayName: sql<string | null>`coalesce(${discordUsers.globalName}, ${discordUsers.username})`
};
```
- **Campos excluidos deliberadamente:** `players.puuid` (identificador interno de cuenta de Riot Games), `players.discordUserId` (identificador de Discord del usuario), `players.createdAt` y `players.updatedAt`.

---

## 4. Consultas Técnicas Destacadas

### 4.1 Resolución de Cuentas Principales con `selectDistinctOn`
**Archivo**: `postgres-competition.repository.ts:341-356`

Un jugador en Discord puede tener múltiples cuentas de League of Legends vinculadas en el sistema. Al consultar el detalle de la plantilla de un equipo (`teamDetail`), se requiere mostrar una sola ficha por persona física, priorizando su cuenta principal de juego:

```typescript
const members = await this.db
  .selectDistinctOn([teamMemberships.discordUserId], {
    id: teamMemberships.discordUserId,
    playerId: players.id,
    name: sql<string>`coalesce(${discordUsers.globalName}, ${discordUsers.username})`,
    role: teamMemberships.role,
    isCaptain: teamMemberships.isCaptain,
    gameName: players.gameName,
    riotTag: players.riotTag,
    countryCode: players.countryCode
  })
  .from(teamMemberships)
  .innerJoin(discordUsers, eq(teamMemberships.discordUserId, discordUsers.discordId))
  .leftJoin(players, eq(players.discordUserId, teamMemberships.discordUserId))
  .where(eq(teamMemberships.teamId, id))
  .orderBy(asc(teamMemberships.discordUserId), desc(players.isMain), asc(players.id));
```
- **Garantía técnica**: La cláusula `selectDistinctOn([discordUserId])` combinada con `desc(players.isMain)` asegura que si existe una cuenta marcada como `isMain === true`, sea esa la seleccionada.
- **Inclusión de Personal Técnico (*Staff / Coach*)**: Mediante el `leftJoin` con `players`, aquellos integrantes de cuerpo técnico que no posean una cuenta de juego vinculada conservan su registro en la plantilla, mostrando su nombre de usuario de Discord (`discordUsers.globalName ?? discordUsers.username`).

### 4.2 Determinación Dinámica de la Jornada Activa
**Archivo**: `postgres-competition.repository.ts:226-241`

Para designar al jugador destacado (*Featured MVP*) de la división, el repositorio resuelve cuál es la jornada más representativa en curso sin requerir campos de estado manuales:
1. Obtiene todas las jornadas de la división (`rounds`).
2. Filtra aquellas candidatas cuya fecha programada ya haya comenzado (`startsAt <= now`) o que ya contengan al menos un partido con estadísticas registradas (`row.roundId === round.id`).
3. Ordena las candidatas por fecha más reciente descendente (`startsAt DESC`) y desempata por identificador de jornada (`round.id DESC`).
4. La primera jornada resultante se utiliza para computar el MVP destacado de la semana.

### 4.3 Consulta de Picks de Campeones
**Archivo**: `postgres-competition.repository.ts:27-45`

Para evitar que partidas preliminares o partidos cancelados alteren las estadísticas públicas de campeones:
```typescript
championPicks(divisionId: string) {
  return this.db
    .select({
      gameId: matchGames.id,
      champion: playerGameInfo.champion,
      teamId: playerGameInfo.teamId,
      winnerTeamId: matchGames.winnerTeamId
    })
    .from(playerGameInfo)
    .innerJoin(matchGames, eq(playerGameInfo.matchGameId, matchGames.id))
    .innerJoin(matches, eq(matchGames.matchesId, matches.id))
    .where(
      and(
        eq(matches.idSeasonDivision, divisionId),
        inArray(matches.status, ['completed', 'forfeit']),
        isNotNull(matchGames.winnerTeamId)
      )
    );
}
```
Únicamente se leen filas donde el partido está finalizado (`'completed'` o `'forfeit'`) y el mapa tiene un ganador registrado (`winnerTeamId IS NOT NULL`).

### 4.4 Proyección de Jornadas y Manejo de `lockAt`
**Archivo**: `postgres-competition.repository.ts:420-434`

```typescript
rounds(divisionId: string) {
  return this.db
    .select({
      id: sql<string>`${rounds.id}::text`,
      sequence: rounds.id,
      divisionId: rounds.idSeasonDivision,
      stage: rounds.stage,
      name: rounds.name,
      startsAt: rounds.startsAt,
      lockAt: sql<null>`NULL`
    })
    .from(rounds)
    .where(eq(rounds.idSeasonDivision, divisionId))
    .orderBy(asc(rounds.id));
}
```
- **Proyección de Atributo Opcional**: El contrato `Round` define la propiedad opcional `lockAt?: string | null`. Sin embargo, la tabla relacional `rounds` en PostgreSQL carece de una columna `lock_at`. En consecuencia, el repositorio proyecta explícitamente `sql<null>'NULL'` para satisfacer la firma de la interfaz sin introducir datos ficticios ni fallar en tiempo de ejecución.
- **Conversión de Claves**: El identificador de jornada en la base de datos es un `smallint`, pero los contratos de la API lo exponen como cadena de texto; por tanto, se castea explícitamente mediante `${rounds.id}::text`.
