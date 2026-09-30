# Tipos y Contratos de Interfaz del Frontend

[⬅️ Volver a Vistas Ensambladoras](pages.md) | [Siguiente: Auth API ➡️](../../../docs/api/auth/README.md)

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

### 3.2 Roles Válidos de Jugadores
**Ubicación**: `apps/web/src/site/pages/players/PlayersPage.tsx:29-37, 134`

```typescript
export const VALID_PLAYER_ROLES = [
  'top',
  'jungle',
  'mid',
  'adc',
  'support',
  'substitute'
] as const;

export type PlayerRoleFilter = (typeof VALID_PLAYER_ROLES)[number] | 'all';
```

### 3.3 Recursos de Competición (`CompetitionResource`)
**Ubicación**: `apps/web/src/features/competition/hooks/useCompetition.ts:5`

```typescript
export type CompetitionResource = 'teams' | 'rounds' | 'calendar' | 'standings';
```

Define los cuatro sub-recursos consultables por división que pueden activarse o desactivarse en `useCompetition`.

---

## 4. Reexportaciones de Contratos del Dominio

El módulo reexporta los contratos compartidos de `@rcl/contracts` para consumo local dentro de `apps/web`:

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

Y define los tipos propios expuestos por las rutas públicas `/api/v1`:
- `Season` (`competition.types.ts:11-16`)
- `Division` (`competition.types.ts:17-23`)
- `Round` (`competition.types.ts:24-30`)
- `Match` (`competition.types.ts:31-44`)
- `Standing` (`competition.types.ts:45-54`)
