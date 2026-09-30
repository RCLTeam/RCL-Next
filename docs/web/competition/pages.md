# Vistas Ensambladoras (Smart Pages)

[⬅️ Volver a Hooks Headless](hooks.md) | [Siguiente: Tipos y Contratos ➡️](types.md)

---

## 1. Visión General

Las vistas ensambladoras (*Smart Pages*) del motor de competición residen en `apps/web/src/site/pages/`. Su responsabilidad exclusiva es:
1. Conectar los hooks de estado y red (`useCompetition`, `useCollection`, `useCompetitionDetail`) con el layout visual común (`PageLayout`).
2. Sincronizar parámetros de búsqueda y filtros interactivos en memoria (búsquedas por texto, roles, ordenación por estadísticas).
3. Transmitir datos limpios hacia los componentes Dumb UI.

Ninguna vista ensambladora contiene lógica de persistencia ni manipulación directa del DOM; operan como orquestadores declarativos de React.

---

## 2. Catálogo de Páginas de Competición

| Página | Ruta Web | Archivo Fuente | Componentes Dumb UI Integrados | Hook de Datos |
|---|---|---|---|---|
| **Clasificación** | `/clasificacion` | `site/pages/standings/StandingsPage.tsx` | `CompetitionFilters`, `DataState`, `StandingsTable` | `useCompetition` (`standings`) |
| **Calendario** | `/calendario` | `site/pages/calendar/CalendarPage.tsx` | `CompetitionFilters`, `RoundFilter`, `DataState`, `MatchList` | `useCompetition` (`calendar`, `rounds`) |
| **Equipos** | `/equipos` | `site/pages/teams/TeamsPage.tsx` | `CompetitionFilters`, `DataState`, `TeamGrid`, `TeamCard` | `useCompetition` (`teams`) |
| **Jugadores** | `/jugadores` | `site/pages/players/PlayersPage.tsx` | `CompetitionFilters`, `DataState`, `FeaturedPlayer`, `PlayerGrid` | `useCollection` (`players`) |
| **Playoffs** | `/playoffs` | `site/pages/playoffs/PlayoffsPage.tsx` | `CompetitionFilters`, `DataState`, `PlayoffBracket` | `useCompetition` (`rounds`, `calendar`) |
| **Campeones** | `/campeones` | `site/pages/champions/ChampionsPage.tsx` | `CompetitionFilters`, `DataState`, `ChampionsTable` | `useCollection` (`champions`) |
| **Detalle de Partido** | `/partidos/:id` | `site/pages/match-details/MatchDetailPage.tsx`| `MatchHeaderCard`, `MatchMatchupsSection`, `MatchStatsSection` | `useCompetitionDetail` (`matches`) |
| **Detalle de Equipo** | `/equipos/:id` | `site/pages/team-details/TeamDetailPage.tsx` | `TeamHero`, `RosterSection`, `TeamHistorySection` | `useCompetitionDetail` (`teams`) |
| **Detalle de Jugador** | `/jugadores/:id`| `site/pages/player-details/PlayerDetailPage.tsx`| `PlayerHero`, `PlayerCareerSection` | `useCompetitionDetail` (`players`) |

---

## 3. Especificación Técnica de las Vistas Principales

### 3.1 `StandingsPage` (Clasificación de Liga)
**Archivo**: `site/pages/standings/StandingsPage.tsx:1-38`

- **Estructura**:
  ```tsx
  <PageLayout
    id="clasificacion"
    number="04"
    title="Clasificación"
    subtitle="El camino a la corona"
    toolbar={
      <CompetitionFilters competition={competition}>
        <span className="meta">
          Fase regular · {competition.division?.name ?? 'Competición RCL'}
        </span>
      </CompetitionFilters>
    }
  >
    <DataState
      state={resolveCompetitionState(competition, competition.standings)}
      empty="La clasificación se publicará cuando haya equipos inscritos."
      retry={competition.retry}
    >
      <StandingsTable rows={competition.standings.data} />
    </DataState>
  </PageLayout>
  ```
- **Garantía de Sincronización**: Utiliza `resolveCompetitionState` para no mostrar tablas vacías si la división todavía está cargando metadatos.

---

### 3.2 `CalendarPage` (Calendario de Partidos y Jornadas)
**Archivo**: `site/pages/calendar/CalendarPage.tsx:1-102`

- **Resolución Automática de la Jornada Más Cercana**:
  Calcula en tiempo real cuál es la jornada actual mediante la función `getClosestRoundId(rounds)` (`líneas 14-36`):
  - Ordena las jornadas por `startsAt ASC`.
  - Encuentra la última jornada cuya fecha sea menor o igual a `now`.
  - Configura un temporizador dinámico (`setTimeout`) para actualizar automáticamente la jornada seleccionada en el momento exacto en que comience la próxima jornada programada (`líneas 54-60`).
- **Filtrado por Jornada**:
  Permite al usuario filtrar partidos por una jornada específica mediante `RoundFilter`, o ver el calendario consolidado si no hay selección activa.

---

### 3.3 `TeamsPage` (Directorio de Equipos)
**Archivo**: `site/pages/teams/TeamsPage.tsx:1-48`

- **Búsqueda Reactiva**:
  Implementa filtrado en memoria sin peticiones de red adicionales:
  ```typescript
  const teams = competition.teams.data.filter((team) =>
    team.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))
  );
  ```
  La búsqueda respeta el locale `'es'` para asegurar la equivalencia de mayúsculas, minúsculas y caracteres específicos del idioma.

---

### 3.4 `PlayersPage` (Directorio de Jugadores y Ficha Destacada)
**Archivo**: `site/pages/players/PlayersPage.tsx:1-338`

- **Jugador Destacado (*Featured MVP*)**:
  Identifica al jugador con la marca `player.competition?.featured` y renderiza el componente `FeaturedPlayer` (`líneas 81-84, 243-285`) con su KDA, participación en bajas y campeón más jugado.
- **Filtrado Multicriterio (`filterPlayers`)**:
  Combina tres filtros concurrentes:
  1. Posición / Rol (`role`): Soporta `all`, `top`, `jungle`, `mid`, `adc`, `support`, `substitute` (`VALID_PLAYER_ROLES`).
  2. Consulta de texto (`query`): Coincidencia en `gameName`, `riotTag` y `displayName`.
  3. Ordenación estadística (`sort`): 7 métricas disponibles (`PlayerSort`: `kda`, `csPerMinute`, `killParticipation`, `winRate`, `damagePerMinute`, `visionScore`, `damageMitigated`).
- **Desempate en Cascada de Jugadores (`líneas 161-184`)**:
  Si dos jugadores tienen igual puntuación estadística:
  1. Valor estadístico descendente.
  2. Nombre del equipo alfabético en locale `'es'`.
  3. Identificador de equipo alfabético.
  4. `gameName` del jugador en locale `'es'`.
  5. Identificador de jugador.

---

### 3.5 `PlayoffsPage` (Cuadro de Eliminatorias)
**Archivo**: `site/pages/playoffs/PlayoffsPage.tsx:1-39`

- **Filtro de Fase de Eliminatorias**:
  ```typescript
  const rounds = competition.rounds.data
    .filter((round) => round.stage === 'playoff')
    .sort((a, b) => a.sequence - b.sequence);
  ```
  Aísla únicamente las jornadas catalogadas con `stage === 'playoff'` y las presenta secuencialmente en el componente `PlayoffBracket`.

---

### 3.6 `ChampionsPage` (Estadísticas de Campeones)
**Archivo**: `site/pages/champions/ChampionsPage.tsx:1-49`

- Consulta `divisions/:divisionId/champions` mediante `useCollection`.
- Integra el catálogo de recursos gráficos de Riot Games (`useGameCatalog`, `riot-assets.service.ts`) para renderizar iconos oficiales de campeones junto a sus porcentajes de victoria y presencia en el torneo.

---

### 3.7 Páginas de Detalle Individual (`MatchDetailPage`, `TeamDetailPage`, `PlayerDetailPage`)
- Utilizan `useCompetitionDetail(resource, id)` para cargar la entidad.
- Manejan el estado `'missing'` para renderizar vistas personalizadas de error cuando un identificador no existe en la base de datos o un partido no se encuentra en estado `'completed'` / `'forfeit'`.
