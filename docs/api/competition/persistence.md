# Persistencia y Consultas Relacionales (Drizzle ORM)

[⬅️ Volver a Procesamiento](processing.md) | [Siguiente: Validación ➡️](validation.md)

---

## 1. Visión General

La persistencia de datos del motor de competición reside en la clase `PostgresCompetitionRepository` (`apps/api/src/modules/competition/postgres-competition.repository.ts:1-477`), implementando la interfaz abstracta `CompetitionRepository`. 

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

### 4.1 Resolución de Plantillas con Cuentas Principales (`teamDetail`)
**Archivo**: `postgres-competition.repository.ts:353-378`

Un jugador en Discord puede tener múltiples cuentas de League of Legends vinculadas en el sistema. Al consultar el detalle de la plantilla de un equipo (`teamDetail`), se requiere mostrar una sola ficha por persona física, priorizando su cuenta principal de juego:

```typescript
// apps/api/src/modules/competition/postgres-competition.repository.ts:357-376
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
  .leftJoin(
    players,
    and(eq(players.discordUserId, teamMemberships.discordUserId), eq(players.isMain, true))
  )
  .where(eq(teamMemberships.teamId, id))
  .orderBy(asc(teamMemberships.discordUserId), desc(players.isMain), asc(players.id));
```
- **Condición Estricta en `leftJoin`**: A diferencia de un cruce general por `discordUserId`, la unión con `players` está condicionada estrictamente a `and(eq(players.discordUserId, teamMemberships.discordUserId), eq(players.isMain, true))`.
- **Garantía Técnica de Unicidad**: La cláusula `selectDistinctOn([teamMemberships.discordUserId])` junto con el ordenamiento `orderBy(asc(teamMemberships.discordUserId), desc(players.isMain), asc(players.id))` garantiza exactamente una sola entrada en el roster por persona física. Las cuentas secundarias (*smurfs* o alias alternativos) quedan deliberadamente excluidas de la plantilla del equipo y solo se visualizan al consultar la ficha de detalle individual del jugador (`playerDetail`).
- **Inclusión de Personal Técnico (*Staff / Coach*)**: Mediante el `leftJoin` con `players`, aquellos integrantes de cuerpo técnico que no posean una cuenta de juego vinculada (o cuya cuenta principal no esté marcada) conservan su registro en la plantilla, mostrando su nombre de usuario de Discord (`coalesce(discordUsers.globalName, discordUsers.username)`).

### 4.2 Consulta de Detalle de Jugador y Cuentas Vinculadas (`playerDetail`)
**Archivo**: `postgres-competition.repository.ts:295-340`

Al consultar el perfil detallado de un jugador (`playerDetail`), el repositorio recupera la información pública del jugador y resuelve dinámicamente el conjunto de cuentas secundarias asociadas a la misma identidad física:

```typescript
// apps/api/src/modules/competition/postgres-competition.repository.ts:295-309
const linkedAccounts = discordUserId
  ? (
      await this.db
        .select(this.playerSelection)
        .from(players)
        .leftJoin(discordUsers, eq(players.discordUserId, discordUsers.discordId))
        .where(eq(players.discordUserId, discordUserId))
        .orderBy(
          desc(players.isMain),
          asc(players.gameName),
          asc(players.riotTag),
          asc(players.id)
        )
    ).filter((account) => account.id !== id)
  : [];
```
- **Resolución de `linkedAccounts`**: Si el jugador dispone de un `discordUserId` verificado, el repositorio consulta en la tabla `players` todos los registros que comparten dicho identificador de Discord, excluyendo el ID del perfil actualmente consultado (`id !== publicPlayer.id`).
- **Jerarquía de Ordenación**: Las cuentas vinculadas se devuelven ordenadas de forma determinista:
  1. `desc(players.isMain)`: Cuentas principales en primera posición.
  2. `asc(players.gameName)`: Orden lexicográfico ascendente por nombre de invocador.
  3. `asc(players.riotTag)`: Orden lexicográfico ascendente por etiqueta de Riot.
  4. `asc(players.id)`: Desempate determinista por clave primaria.
- **Historial de Equipos (`memberships`)**: En la misma consulta (`líneas 310-335`), se recupera el historial de participaciones del jugador en equipos a través de todas las temporadas registradas, ordenado cronológicamente por `sql`${seasons.startsOn} DESC NULLS LAST``, `asc(seasons.name)`, `asc(teams.name)` y `asc(teams.id)`.

### 4.3 Determinación Dinámica de la Jornada Activa
**Archivo**: `postgres-competition.repository.ts:226-241`

Para designar al jugador destacado (*Featured MVP*) de la división, el repositorio resuelve cuál es la jornada más representativa en curso sin requerir campos de estado manuales:
1. Obtiene todas las jornadas de la división (`rounds`).
2. Filtra aquellas candidatas cuya fecha programada ya haya comenzado (`startsAt <= now`) o que ya contengan al menos un partido con estadísticas registradas (`row.roundId === round.id`).
3. Ordena las candidatas por fecha más reciente descendente (`startsAt DESC`) y desempata por identificador de jornada (`round.id DESC`).
4. La primera jornada resultante se utiliza para computar el MVP destacado de la semana.

### 4.4 Consulta de Picks de Campeones
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

### 4.5 Proyección de Jornadas y Manejo de `lockAt`
**Archivo**: `postgres-competition.repository.ts:440-454`

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

### 4.6 Proyección de Equipos y Partidos en División
**Archivo**: `postgres-competition.repository.ts:424-476`

Al consultar los equipos y enfrentamientos de una división (`teams` y `matches`), el repositorio aplica proyecciones tipadas para garantizar la seguridad numérica en tiempo de ejecución y la coherencia de estados de retransmisión:

```typescript
// apps/api/src/modules/competition/postgres-competition.repository.ts:424-439
teams(divisionId: string) {
  return this.db
    .select({
      id: teams.id,
      divisionId: teams.seasonDivisionId,
      name: teams.name,
      shortName: teams.shortName,
      logoUrl: teams.logoUrl,
      color: teams.color,
      isActive: teams.isActive,
      discordRoleId: sql<string | null>`${teams.discordRoleId}::text`
    })
    .from(teams)
    .where(eq(teams.seasonDivisionId, divisionId))
    .orderBy(asc(teams.name), asc(teams.id));
}
```

```typescript
// apps/api/src/modules/competition/postgres-competition.repository.ts:455-476
matches(divisionId: string) {
  return this.db
    .select({
      id: matches.id,
      divisionId: matches.idSeasonDivision,
      roundId: sql<string | null>`${matches.idRound}::text`,
      homeTeamId: matches.team1Id,
      awayTeamId: matches.team2Id,
      homeScore: matches.team1Score,
      awayScore: matches.team2Score,
      winnerTeamId: matches.winnerTeamId,
      status: matches.status,
      bestOf: matches.bestOf,
      scheduledAt: matches.scheduledAt,
      finishedAt: matches.finishedAt,
      streamUrl: matches.streamUrl,
      streamUrlLive: matches.streamUrlLive
    })
    .from(matches)
    .where(eq(matches.idSeasonDivision, divisionId))
    .orderBy(asc(matches.scheduledAt), asc(matches.id));
}
```

- **Serialización de `discordRoleId` a String (`sql<string | null>\`${teams.discordRoleId}::text\``):**
  - En la base de datos PostgreSQL, la columna `discord_role_id` es de tipo `bigint` (entero de 64 bits con signo).
  - Los identificadores Snowflake de Discord son enteros de 64 bits cuyos valores superan con frecuencia $2^{53} - 1$ (`Number.MAX_SAFE_INTEGER`, 9.007.199.254.740.991). Al pasar por `JSON.stringify` en Node.js, cualquier `number` de 64 bits que sobrepase dicho límite sufre pérdida silenciosa de precisión por truncamiento en los bits menos significativos.
  - El casteo explícito a nivel de motor SQL `${teams.discordRoleId}::text` asegura que el identificador llegue a la API y al cliente web intacto como `string`, permitiendo la correcta evaluación de sentinels (`isActiveTeam` y `isTeamVisibleInCalendar`).
- **Proyección Dual de Retransmisión (`streamUrl` y `streamUrlLive`):**
  - La consulta proyecta conjuntamente `streamUrl: matches.streamUrl` y `streamUrlLive: matches.streamUrlLive`.
  - Esta distinción permite al frontend diferenciar entre un enlace a retransmisión diferida o archivo histórico (VOD) y una emisión en directo activa en plataformas de streaming (Twitch/YouTube), actualizando los indicadores visuales en tarjetas de partido.

