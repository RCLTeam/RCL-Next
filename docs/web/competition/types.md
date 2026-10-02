# Tipos y Contratos de Interfaz del Frontend

[⬅️ Volver a Vistas Ensambladoras](pages.md) | [Siguiente: Auth API ➡️](../../api/auth/README.md)

---

## 1. Visión General

El archivo `apps/web/src/features/competition/types/competition.types.ts` concentra los tipos de estado de cliente, uniones discriminadas y reexportaciones de contratos para los componentes y vistas de la interfaz web.

Garantiza la consistencia entre los DTOs devueltos por la API `/api/v1` y las estructuras reactivas consumidas por los componentes de React.

---

## 2. Tipos de Estado de UI

### 2.1 Estado de Colecciones (`CollectionState<T>`)
**Ubicación**: `competition.types.ts:55-57`

Representa el ciclo de vida de peticiones que devuelven listas o colecciones de elementos:

```typescript
export type CollectionState<T> =
  | { status: 'loading' | 'error'; data: T[] }
  | { status: 'ready'; data: T[] };
```

- **Invariante de seguridad**: Siempre expone la propiedad `data: T[]`, garantizando que un componente que consuma `state.data` pueda iterar mediante `.map()` o `.filter()` de forma segura sin peligro de excepciones por `undefined` durante los estados de carga o error.

### 2.2 Estado de Entidades Singulares (`DetailState<T>`)
**Ubicación**: `apps/web/src/features/competition/hooks/useCompetitionDetail.ts:4`

Representa el estado de una entidad individual en páginas de detalle:

```typescript
export type DetailState<T> =
  | { status: 'loading' | 'error' | 'missing' }
  | { status: 'ready'; data: T };
```

- **Estado Semántico `'missing'`**: Se activa cuando la entidad solicitada devuelve HTTP 404 (no existe) o 422 (formato o estado inválido), permitiendo renderizar vistas de "No encontrado" limpias sin colapsar la aplicación.

---

## 3. Uniones de Filtros y Ordenación

### 3.1 Criterios de Ordenación de Jugadores (`PlayerSort`)
**Ubicación**: `apps/web/src/site/pages/players/PlayersPage.tsx:19-28`

```typescript
export const playerSortOptions = [
  ['kda', 'KDA'],
  ['csPerMinute', 'CS/min'],
  ['killParticipation', 'Kill participation'],
  ['winRate', '% de victorias'],
  ['damagePerMinute', 'Daño a campeones/min'],
  ['visionScore', 'Puntuación de visión'],
  ['damageMitigated', 'Daño mitigado']
] as const;

export type PlayerSort = (typeof playerSortOptions)[number][0];
```

### 3.2 Opciones de Rol y Filtrado de Jugadores
**Ubicación**: `apps/web/src/site/pages/players/PlayersPage.tsx:29-37, 134`

La página define la tupla inmutable de opciones de filtrado visual de roles con sus respectivas etiquetas:

```typescript
// apps/web/src/site/pages/players/PlayersPage.tsx:29-37
const roles = [
  ['all', 'Todos'],
  ['top', 'Top'],
  ['jungle', 'Jungla'],
  ['mid', 'Mid'],
  ['adc', 'ADC'],
  ['support', 'Support'],
  ['substitute', 'Suplente']
] as const;
```

Y en la función `filterPlayers` (`PlayersPage.tsx:134`), se define la lista de roles deportivos válidos para la validación de entrada frente a roles genéricos:

```typescript
// apps/web/src/site/pages/players/PlayersPage.tsx:134
const VALID_PLAYER_ROLES = ['top', 'jungle', 'mid', 'adc', 'support', 'substitute'];
```

El filtro opera directamente sobre las cadenas tipadas inferidas de la tupla `roles` (sin requerir un tipo separado exportado), con valor por defecto `'all'` en el estado de filtrado.

### 3.3 Recursos de Competición (`CompetitionResource`)
**Ubicación**: `apps/web/src/features/competition/hooks/useCompetition.ts:5`

```typescript
export type CompetitionResource = 'teams' | 'rounds' | 'calendar' | 'standings';
```

Define los cuatro sub-recursos consultables por división que pueden activarse o desactivarse en `useCompetition`.

---

## 4. Reexportaciones y Extensión de Contratos del Dominio

El módulo reexporta los contratos compartidos de `@rcl/contracts` (`packages/contracts/src/competition-profiles.ts:1-80`) para consumo local dentro de `apps/web`:

```typescript
// competition.types.ts:1-9
import type { TeamSummary as Team } from '@rcl/contracts';
export type {
  TeamSummary as Team,
  TeamDetail,
  TeamMember,
  Player,
  PlayerTeam,
  PlayerDetail
} from '@rcl/contracts';
```

### 4.1 Contratos Principales de Competición (`@rcl/contracts`)

- **`TeamSummary` (`competition-profiles.ts:1-9`)**:
  Estructura base representativa de un club deportivo:
  ```typescript
  export interface TeamSummary {
    slug?: string | undefined;
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    color?: string | null;
    discordRoleId?: string | null;
  }
  ```
  - `discordRoleId`: Identificador numérico de Discord en formato texto (*snowflake*) consumido por las reglas de visibilidad (`team-visibility.ts`) para discriminar clubes en activo (`>= 0n`), equipos retirados con registro histórico preservado en calendario (`>= -10n`) y clubes fantasma (`null` o sin rol).

- **`TeamDetail` (`competition-profiles.ts:31-38`)**:
  Ficha extendida de un club consumida en `TeamDetailPage`:
  ```typescript
  export interface TeamDetail extends TeamSummary {
    divisionId: string;
    color: string | null;
    isActive: boolean;
    seasonName: string;
    divisionName: string;
    members: TeamMember[];
  }
  ```
  - `isActive`: Bandera booleana de actividad competitiva en la temporada.
  - `members`: Arreglo de integrantes del club (`TeamMember[]`) clasificados en roles de juego (`playerRoles`), cuerpo técnico (`coach`), gestión (`staff`) y colaboradores (`partners`).

- **`Player` (`competition-profiles.ts:40-57`)**:
  Modelo individual de competidor:
  ```typescript
  export interface Player {
    competition?: {
      isCaptain?: boolean;
      role: string | null;
      team: TeamSummary | null;
      champion: string | null;
      stats: PlayerStatistics | null;
      mvpMatchIds: string[];
      featured: { roundName: string; stats: PlayerStatistics } | null;
    };
    slug?: string | undefined;
    id: string;
    gameName: string;
    riotTag: string | null;
    countryCode: string | null;
    isMain: boolean;
    displayName: string | null;
  }
  ```
  - `isMain`: Distingue si la ficha corresponde a la cuenta principal del invocador o a una cuenta secundaria vinculada registrada en la plataforma.
  - `slug`: Identificador alfanumérico amigable para enrutamiento (`/jugadores/:slugOrId`).

- **`PlayerTeam` (`competition-profiles.ts:68-75`)**:
  Historial de vinculación deportiva de un jugador con un club:
  ```typescript
  export interface PlayerTeam extends TeamSummary {
    divisionId?: string;
    seasonName: string;
    divisionName: string;
    role: TeamMember['role'];
    isCaptain: boolean;
    isActive: boolean;
  }
  ```

- **`PlayerDetail` (`competition-profiles.ts:76-79`)**:
  Ficha integral de jugador consumida en `PlayerDetailPage`:
  ```typescript
  export interface PlayerDetail extends Player {
    linkedAccounts?: Player[];
    teams: PlayerTeam[];
  }
  ```
  - `linkedAccounts`: Arreglo opcional con las cuentas adicionales asociadas al mismo usuario (`discordUserId`), permitiendo la navegación cruzada y la auditoría de cuentas secundarias (*smurfs*).
  - `teams`: Historial completo de inscripciones en competiciones de la liga por división y temporada.

### 4.2 Modelos Propios de la API Pública de Competición

Estructuras JSON públicas devueltas por los endpoints `/api/v1` de competición:
- `Season` (`competition.types.ts:11-16`): Temporada competitiva con fechas de inicio y finalización.
- `Division` (`competition.types.ts:17-23`): División dentro de una temporada con código y orden de visualización.
- `Round` (`competition.types.ts:24-30`): Jornada con número de secuencia, fase (`stage`: `'regular'` o `'playoff'`) y fecha programada.
- `Match` (`competition.types.ts:31-44`): Enfrentamiento con equipos, tanteo, estado (`'scheduled' | 'live' | 'completed' | 'forfeit' | 'cancelled'`), formato BO y enlaces a streaming.
- `Standing` (`competition.types.ts:45-54`): Fila de clasificación de la fase regular con balance de victorias, derrotas y diferencia de mapas.
