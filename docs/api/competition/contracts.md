# Contratos y DTOs de Competición

[⬅️ Volver a Validación](validation.md) | [Siguiente: Web Competition ➡️](../../../docs/web/competition/README.md)

---

## 1. Visión General

Los contratos de interfaz y DTOs (*Data Transfer Objects*) del motor de competición están centralizados en el paquete monorepo `@rcl/contracts` (`packages/contracts/src/`) y compartidos entre el backend (`apps/api`) y el frontend (`apps/web`).

Estos tipos definen la forma canónica de las cargas útiles serializadas en las respuestas JSON de la API pública `/api/v1`.

---

## 2. DTOs de Entidades de Competición

### 2.1 Temporada (`Season`)
**Ubicación**: `apps/web/src/features/competition/types/competition.types.ts:11-16`

```typescript
export interface Season {
  id: string;              // Nombre canónico de la temporada (ej. "Temporada 1")
  name: string;            // Nombre descriptivo
  startsOn?: string | null;// Fecha ISO de inicio (YYYY-MM-DD)
  endsOn?: string | null;  // Fecha ISO de fin (YYYY-MM-DD)
}
```

### 2.2 División (`Division`)
**Ubicación**: `apps/web/src/features/competition/types/competition.types.ts:17-23`

```typescript
export interface Division {
  id: string;              // UUID en tabla seasons_divisions
  seasonId: string;        // Nombre de la temporada asociada
  code: string;            // Código o nombre de la división (ej. "Premier", "Segunda")
  name: string;            // Nombre de la división
  sortOrder: number;       // Orden jerárquico de visualización
}
```

### 2.3 Jornada (`Round`)
**Ubicación**: `apps/web/src/features/competition/types/competition.types.ts:24-30`

```typescript
export interface Round {
  id: string;              // Identificador numérico serializado como texto
  sequence: number;        // Número ordinal de jornada
  stage: string;           // Fase del torneo ('regular', 'playoff')
  name: string | null;     // Nombre de la jornada (ej. "Jornada 1", "Cuartos de final")
  startsAt?: string | null;// Marca de tiempo ISO de inicio programado
  lockAt?: string | null;  // Proyectado como NULL en persistencia
}
```

### 2.4 Resumen de Equipo (`TeamSummary` / `Team`)
**Ubicación**: `packages/contracts/src/competition-profiles.ts:1-8`

```typescript
export interface TeamSummary {
  id: string;              // UUID del equipo
  slug?: string;           // Slug determinista para URLs amigables
  name: string;            // Nombre completo del equipo
  shortName: string | null;// Siglas o acrónimo (ej. "RCL", "REB")
  logoUrl: string | null;  // Ruta relativa o URL del escudo
  color?: string | null;   // Código de color hexadecimal de identidad
}
```

### 2.5 Partido (`Match`)
**Ubicación**: `apps/web/src/features/competition/types/competition.types.ts:31-44`

```typescript
export interface Match {
  id: string;              // UUID del enfrentamiento
  slug?: string;           // Slug del partido (ej. "equipo-a-vs-equipo-b-jornada-1")
  homeTeam?: TeamSummary;  // Equipo local
  awayTeam?: TeamSummary;  // Equipo visitante
  homeScore: number;       // Mapas ganados por el equipo local
  awayScore: number;       // Mapas ganados por el equipo visitante
  status: 'scheduled' | 'live' | 'completed' | 'forfeit' | 'cancelled';
  bestOf: number;          // Formato de serie (ej. 3 para BO3)
  scheduledAt: string | null;  // Fecha/hora ISO programada
  streamUrl: string | null;    // URL de la grabación o retransmisión
  streamUrlLive: string | null;// URL de la retransmisión en directo
  round: Round | null;     // Metadatos de la jornada asociada
}
```

### 2.6 Clasificación de Fase Regular (`Standing`)
**Ubicación**: `apps/web/src/features/competition/types/competition.types.ts:45-54`

```typescript
export interface Standing {
  position: number;        // Posición ordinal en la tabla (1-indexed)
  team: TeamSummary;       // Información básica del equipo
  played: number;          // Total de series disputadas
  wins: number;            // Series ganadas
  losses: number;          // Series perdidas
  mapsWon: number;         // Mapas individuales ganados
  mapsLost: number;        // Mapas individuales perdidos
  mapDifference: number;   // Diferencia de mapas (mapsWon - mapsLost)
}
```

---

## 3. DTOs de Detalle Avanzado

### 3.1 Detalle de Partido (`MatchDetail`)
**Ubicación**: `packages/contracts/src/match-detail.ts:88-103`

```typescript
export interface MatchDetail {
  id: string;
  slug?: string;
  homeScore: number;
  awayScore: number;
  status: 'completed' | 'forfeit';
  bestOf: number;
  winnerTeamId: string | null;
  seasonName: string;
  divisionName: string;
  roundName: string | null;
  mvpPlayerId?: string | null;
  homeTeam: { id: string; name: string; shortName: string | null; logoUrl: string | null };
  awayTeam: { id: string; name: string; shortName: string | null; logoUrl: string | null };
  games: MatchMap[];
}
```

Donde `MatchMap` desglosa cada mapa individual:
```typescript
export interface MatchMap {
  id: string;
  gameNumber: number;
  blueTeamId: string;
  redTeamId: string;
  winnerTeamId: string | null;
  durationSeconds: number | null;
  participants: MatchParticipant[];
}
```

### 3.2 Detalle de Jugador (`PlayerDetail`)
**Ubicación**: `packages/contracts/src/competition-profiles.ts:39-78`

```typescript
export interface Player {
  id: string;
  slug?: string;
  gameName: string;
  riotTag: string | null;
  countryCode: string | null;
  isMain: boolean;
  displayName: string | null;
  competition?: {
    isCaptain?: boolean;
    role: string | null;
    team: TeamSummary | null;
    champion: string | null;
    stats: PlayerStatistics | null;
    mvpMatchIds: string[];
    featured: { roundName: string; stats: PlayerStatistics } | null;
  };
}

export interface PlayerDetail extends Player {
  teams: PlayerTeam[];
}
```

### 3.3 Detalle de Equipo (`TeamDetail`)
**Ubicación**: `packages/contracts/src/competition-profiles.ts:9-37`

```typescript
export interface TeamDetail extends TeamSummary {
  divisionId: string;
  color: string | null;
  isActive: boolean;
  seasonName: string;
  divisionName: string;
  members: TeamMember[];
}

export interface TeamMember {
  id: string;
  name: string;
  role: 'top' | 'jungle' | 'mid' | 'adc' | 'support' | 'substitute' | 'coach' | 'staff' | 'partners';
  isCaptain: boolean;
  gameName: string | null;
  riotTag: string | null;
  countryCode: string | null;
  playerId?: string | null;
  playerSlug?: string;
  rosterStats?: {
    games: number;
    mvps: number;
    champions: number;
  };
}
```

### 3.4 Estadísticas de Campeones (`ChampionStats`)
**Ubicación**: `packages/contracts/src/champion-stats.ts:1-9`

```typescript
export interface ChampionStats {
  champion: string;   // Nombre del campeón
  games: number;      // Mapas disputados
  wins: number;       // Mapas ganados
  losses: number;     // Mapas perdidos
  totalGames: number; // Total de mapas disputados en la división
  pickRate: number;   // Porcentaje de presencia en selecciones (0-100)
  winRate: number;    // Porcentaje de victorias (0-100)
}
```

### 3.5 Fila de Partida Individual de Jugador (`PlayerGameRow`)
**Ubicación**: `apps/api/src/modules/competition/player-statistics.ts:3-23`

Estructura atómica que representa el rendimiento de un jugador en un mapa individual, consumida por el repositorio PostgreSQL y los algoritmos de agregación estadística y valoración MVP:

```typescript
export interface PlayerGameRow {
  playerId: string;
  gameId: string;
  matchId: string;
  divisionId: string;
  roundId: number | null;
  teamId: string;
  team: TeamSummary;
  position: string | null;
  champion: string;
  durationSeconds: number | null;
  winnerTeamId: string | null;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damageToChampions: number;
  goldEarned: number | null;
  visionScore: number | null;
  damageMitigated: number | null;
}
```

- **Obligatoriedad de `goldEarned` (`number | null`)**: A diferencia de versiones preliminares donde el campo era opcional (`goldEarned?: number | null`), la propiedad es estrictamente obligatoria. Esto evita omisiones accidentales en consultas SQL/ORM (`players` y `playerSeasonGames`) y garantiza la disponibilidad de datos para el cálculo de eficiencia económica de daño (`DPG`) y oro por minuto (`GPM`) en el algoritmo de MVP.

---

## 4. Contratos de Persistencia (`CompetitionRepository`)
**Ubicación**: `apps/api/src/modules/competition/competition.repository.ts:60-86`

La interfaz `CompetitionRepository` define las operaciones requeridas por la capa de servicio para consultar la base de datos relacional. Para dar soporte a la agregación de estadísticas y premios MVP en traspasos entre equipos o divisiones, define el método `playerSeasonGames`:

```typescript
// apps/api/src/modules/competition/competition.repository.ts:70-76
playerSeasonGames(
  playerId: string,
  seasonName: string
): Promise<{
  playerGames: PlayerGameRow[];
  allMatchGames: PlayerGameRow[];
}>;
```

- **`playerId` (`string`)**: UUID del jugador a consultar.
- **`seasonName` (`string`)**: Nombre canónico de la temporada deportiva (ej. `"Temporada 1"`).
- **Retorno (`Promise<{ playerGames: PlayerGameRow[]; allMatchGames: PlayerGameRow[] }>`):**
  - `playerGames`: Colección de todas las partidas disputadas por el jugador a lo largo de la temporada completa (independientemente del equipo o división en que las haya jugado), ordenadas cronológicamente (`asc(matches.finishedAt)`).
  - `allMatchGames`: Registros de todos los participantes en las series en las que intervino el jugador, requeridos para computar el contexto relativo de MVP de cada enfrentamiento mediante `matchMvps(allMatchGames)`.


