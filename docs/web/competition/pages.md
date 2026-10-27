# Vistas Ensambladoras (Smart Pages)

[⬅️ Volver a Hooks Headless](hooks.md) | [Siguiente: Tipos y Contratos ➡️](types.md)

---

## 1. Visión General

Las vistas ensambladoras (*Smart Pages*) del motor de competición residen en `apps/web/src/site/pages/`. Su responsabilidad exclusiva es:
1. Conectar los hooks de estado y red (`useCompetition`, `useCollection`, `useCompetitionDetail`) con el layout visual común (`PageLayout`).
2. Sincronizar parámetros de búsqueda y filtros interactivos en memoria (búsquedas por texto, roles, ordenación por estadísticas).
3. Transmitir datos limpios hacia los componentes Dumb UI.

Ninguna vista ensambladora contiene lógica de persistencia ni manipulación directa del DOM; operan como orquestadores declarativos de React.

### MVP persistidos

El frontend muestra los galardones enviados por la API y no elige ganadores a partir de estadísticas ni del antiguo `stats.isMvp` (deprecado en el contrato):

- La ficha del partido utiliza `mvpPlayerId` para toda la serie, con independencia del mapa seleccionado. El nombre y el slug del MVP llegan en `mvpPlayer`, por lo que mantiene el enlace nominal aunque falten participantes importados; si no hay galardón, muestra «No disponible.». Las incomparecencias no muestran un MVP.
- El directorio y la ficha de jugador muestran el número de `mvpMatchIds`, incluso cuando faltan estadísticas. Los jugadores con galardones históricos siguen apareciendo en el filtro «Todos» aunque ya no tengan rol de plantilla. Las estadísticas ausentes se muestran con «—». El selector permite ordenar por número de MVPs guardados, de mayor a menor, con desempate por nombre e ID.
- La sección de rendimiento de la ficha se identifica por temporada, ya que sus estadísticas y MVP abarcan todos los equipos y divisiones de esa temporada. Los contadores de equipo siguen utilizando `rosterStats.mvps` de la API.
- En empates de nota máxima de la jornada, la API desempata entre los MVP guardados por nota sin redondear, victorias, participación en bajas, KDA y daño; el ID del jugador solo decide un empate completo. Las estadísticas se consultan únicamente para las series empatadas.
- El banner conserva el jugador y el nombre de jornada de `competition.featured`, incluida una jornada anterior. Sin destacado, indica «Todavía no hay un MVP de jornada disponible en esta división».

El campo de mapa `isMvp` se conserva temporalmente por compatibilidad, pero no representa el MVP de enfrentamiento. La migración y el [backfill de históricos](../../database/mvp-backfill.md) deben aplicarse antes de desplegar las lecturas persistidas.

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
| **Detalle de Partido** | `/partidos/:id` | `site/pages/match-details/MatchDetailPage.tsx` | `TeamBadge`, `MatchReport`, `MatchMatchupsSection`, `MatchStatsSection` (marcador BO, MVP de serie, selector de mapa, enfrentamientos y estadísticas) | `useCompetitionDetail` (`matches`) |
| **Detalle de Equipo** | `/equipos/:id` | `site/pages/team-details/TeamDetailPage.tsx` | `TeamBadge`, `TeamProfile`, `MemberSection` (perfil institucional, estado activo/inactivo, Multi OP.GG, desglose de plantilla por roles y estadísticas) | `useCompetitionDetail` (`teams`) |
| **Detalle de Jugador** | `/jugadores/:id` | `site/pages/player-details/PlayerDetailPage.tsx` | `TeamBadge`, `PlayerProfile` (métricas de rendimiento, cuentas secundarias vinculadas con enlace a OP.GG e histórico de inscripciones) | `useCompetitionDetail` (`players`) |

---

## 3. Especificación Técnica de las Vistas Principales

### 3.1 `StandingsPage` (Clasificación de Liga)
**Archivo**: `site/pages/standings/StandingsPage.tsx:1-37`

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
**Archivo**: `site/pages/calendar/CalendarPage.tsx:1-101`

- **Resolución Automática de la Jornada Más Cercana**:
  Calcula en tiempo real cuál es la jornada actual mediante la función `getClosestRoundId(rounds)` (`líneas 14-36`):
  - Ordena las jornadas por `startsAt ASC`.
  - Encuentra la última jornada cuya fecha sea menor o igual a `now`.
  - Configura un temporizador dinámico (`setTimeout`) para actualizar automáticamente la jornada seleccionada en el momento exacto en que comience la próxima jornada programada (`líneas 54-60`).
- **Filtrado por Jornada**:
  Permite al usuario filtrar partidos por una jornada específica mediante `RoundFilter`, o ver el calendario consolidado si no hay selección activa.

---

### 3.3 `TeamsPage` (Directorio de Equipos)
**Archivo**: `site/pages/teams/TeamsPage.tsx:1-47`

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
**Archivo**: `site/pages/players/PlayersPage.tsx:1-377`

- **Jugador Destacado (`FeaturedPlayer`)**:
  Se monta en `PlayersPage.tsx:97-100` con el jugador que tenga `player.competition?.featured`. El componente (`PlayersPage.tsx:261-313`) muestra `featured.roundName`, identidad, equipo y campeón, además de las siete métricas de `playerSortOptions.filter(([key]) => key !== 'mvps')` (`PlayersPage.tsx:294-303`). Sus valores proceden de `featured.stats`, correspondientes a la jornada destacada.
- **Filtrado Multicriterio (`filterPlayers`)**:
  Combina filtros de rol y texto con la ordenación seleccionada:
  1. Posición / Rol (`role`): Soporta `all`, `top`, `jungle`, `mid`, `adc`, `support` y `substitute`. Para `all`, admite un rol incluido en `VALID_PLAYER_ROLES`, estadísticas o MVPs guardados: `VALID_PLAYER_ROLES.includes(playerRole ?? '') || hasStats || hasAwards` (`PlayersPage.tsx:165-167`).
  2. Consulta de texto (`query`): Coincidencia en `gameName`, `riotTag` y `displayName`.
  3. Ordenación (`sort`): Ocho opciones (`PlayersPage.tsx:19-29`): `kda`, `mvps`, `csPerMinute`, `killParticipation`, `winRate`, `damagePerMinute`, `visionScore` y `damageMitigated`. `mvps` utiliza el número de identificadores en `mvpMatchIds`, con fallback a `0`, sin depender de estadísticas.
- **Ordenación y Desempates (`PlayersPage.tsx:178-203`)**:
  - Si solo un jugador tiene valor nulo, queda después del que tiene valor.
  - Si ambos tienen valor, ordena de mayor a menor y desempata exclusivamente por `gameName` en locale `'es'` y por ID de jugador (`PlayersPage.tsx:200-202`). Esta regla también se aplica a `mvps`, cuyo valor nunca es nulo.
  - Solo cuando ambos valores son nulos aplica el criterio por equipo (`PlayersPage.tsx:185-197`): primero jugadores con equipo; después nombre de equipo en locale `'es'`, ID de equipo, `gameName` en locale `'es'` e ID de jugador.


---

### 3.5 `PlayoffsPage` (Cuadro de Eliminatorias)
**Archivo**: `site/pages/playoffs/PlayoffsPage.tsx:1-38`

- **Filtro de Fase de Eliminatorias**:
  ```typescript
  const rounds = competition.rounds.data
    .filter((round) => round.stage === 'playoff')
    .sort((a, b) => a.sequence - b.sequence);
  ```
  Aísla únicamente las jornadas catalogadas con `stage === 'playoff'` y las presenta secuencialmente en el componente `PlayoffBracket`.

---

### 3.6 `ChampionsPage` (Estadísticas de Campeones)
**Archivo**: `site/pages/champions/ChampionsPage.tsx:1-48`

- Consulta `divisions/:divisionId/champions` mediante `useCollection`.
- Integra el catálogo de recursos gráficos de Riot Games (`useGameCatalog`, `apps/web/src/shared/riot/riot-assets.service.ts`) para renderizar iconos oficiales de campeones junto a sus porcentajes de victoria y presencia en el torneo.

---

### 3.7 `MatchDetailPage` (Ficha de Detalle de Partido)
**Archivo**: `site/pages/match-details/MatchDetailPage.tsx:1-166`

Orquesta la vista completa del resultado de un enfrentamiento competitivo, integrando el catálogo visual de Riot Games (`useGameCatalog`), el selector de mapas disputados, el MVP determinista de la serie y la navegación por pestañas entre enfrentamientos directos y estadísticas cuantitativas.

- **Ciclo de Vida y Estados Asíncronos**:
  - Consume `useCompetitionDetail('matches', matchId)`.
  - Sincroniza el título del documento reactivamente (`document.title = `${state.data.homeTeam.name} vs ${state.data.awayTeam.name} · Rebel Crown Legacy``) al alcanzar el estado `'ready'`.
  - Resuelve estados en `PageLayout`:
    - `'loading'`: Mensaje accesible de carga (`<output className="empty-state">Cargando partido…</output>`).
    - `'missing'`: Aviso específico de no disponibilidad (`Partido no disponible. La ficha se publica al terminar el encuentro.`), activado ante HTTP 404 o si el partido no se encuentra en estado `'completed'` o `'forfeit'`.
    - `'error'`: Contenedor accesible (`role="alert"`) con botón interactivo de reintento (`retry`).
    - `'ready'`: Delega el reporte estructurado en el componente interno `MatchReport`.

- **Cabecera y Reporte Oficial de Incidencias (`match-header-card`)**:
  - **Marcador Global (`match-report-score`)**: Presenta los emblemas (`TeamBadge`) y nombres de ambos equipos, el marcador de la serie (`match.homeScore – match.awayScore`) y el estado competitivo, distinguiendo incomparecencias administrativas (`match.status === 'forfeit' ? 'Incomparecencia' : 'Resultado final'`) y el formato al mejor de mapas (`BO{match.bestOf}`).
  - **Sección Destacada de MVP de la Serie (`match-series-mvp`)**:
    - El galardón de toda la serie se identifica con `match.mvpPlayerId`, persistido por el backend usando `matchMvps` (`apps/api/src/modules/competition/player-statistics.ts:236-276`). La interfaz no lo recalcula.
    - Usa `match.mvpPlayer` si su `id` coincide con `match.mvpPlayerId`; como respaldo busca ese ID entre los participantes de todos los mapas. El enlace es `/jugadores/${encodeURIComponent(identity?.slug ?? match.mvpPlayerId)}`: prefiere el slug y conserva el ID persistido como fallback.
    - En partidos `completed` muestra «MVP del enfrentamiento». Con identidad disponible presenta `gameName` y, si existe, `#riotTag`; si hay ID pero no identidad ni participante, el enlace dice «Ver jugador MVP». Sin `match.mvpPlayerId` muestra «No disponible.». En `forfeit` no muestra la sección MVP.
    - Implementación: `site/pages/match-details/MatchDetailPage.tsx:20-25, 54-67`.

- **Barra Unificada de Sub-Tarjetas de Mapas (`match-subcard-bar`)**:
  - **Columna de Contexto (`match-context-col`)**: Despliega la ruta competitiva completa (`seasonName · divisionName · roundName`).
  - **Selector de Mapas (`match-selector-col`)**: Agrupa una botonera interactiva (`role="toolbar"`, `aria-label="Seleccionar mapa"`) donde cada botón (`btn-selector`, `aria-pressed={game?.id === item.id}`) conmuta el identificador del mapa activo (`gameChoice`) en el estado local de React.
  - **Columna de Resultado del Mapa (`match-result-col`)**: Expone el club vencedor del mapa seleccionado (`winner ? `Victoria de ${winner}` : 'Ganador no registrado'`) junto a la duración exacta de la partida formateada en minutos y segundos (`mm:ss`) calculada a partir de `game.durationSeconds`.

- **Navegación por Pestañas y Secciones Condicionales (`match-section-nav`)**:
  - Implementa un control de pestañas con accesibilidad WAI-ARIA (`role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `tabIndex` reactivo):
    1. **Pestaña `Enfrentamiento`** (`section === 'enfrentamientos'`): Monta `MatchMatchupsSection`, desplegando la comparativa calle por calle (`TOP`, `JUNGLE`, `MID`, `ADC`, `SUPPORT`, `SIN POSICIÓN`), las runas, los hechizos de invocador y la build compactada de objetos.
    2. **Pestaña `Estadísticas`** (`section === 'estadisticas'`): Monta `MatchStatsSection`, proporcionando un selector desplegable accesible de jugadores (`Select`) y el desglose de métricas de juego organizadas en 4 categorías (*Combate*, *Economía y visión*, *Objetivos* y *Actividad*).

---

### 3.8 `TeamDetailPage` (Ficha de Detalle de Equipo)
**Archivo**: `site/pages/team-details/TeamDetailPage.tsx:1-242`

Orquesta la vista del perfil institucional y deportivo de un club, integrando la temática visual del equipo, el estado de actividad competitiva, el generador de enlaces a la herramienta Multi OP.GG y la plantilla categorizada por funciones técnicas.

- **Ciclo de Vida y Estados Asíncronos**:
  - Consume `useCompetitionDetail('teams', teamId)`.
  - Sincroniza dinámicamente el título del navegador (`document.title = `${state.data.name} · Rebel Crown Legacy``) en estado `'ready'`.
  - Presenta estados dedicados en `PageLayout`: `'loading'`, `'missing'` ("Equipo no encontrado. Puede que ya no esté disponible."), `'error'` con reintento y `'ready'` renderizando `TeamProfile`.

- **Cabecera y Estado Competitivo (`team-profile-header`)**:
  - Inyecta la variable CSS `--team-color` con el color corporativo del equipo (`team.color || 'var(--panel)'`), tiñendo bordes, sombras y acentos visuales de la ficha.
  - Renderiza el emblema oficial (`TeamBadge`), el acrónimo distintivo (`team.shortName ?? team.name`), la división y la temporada.
  - **Indicador de Estado de Actividad (`team-profile-status`)**: Muestra explícitamente si el club participa activamente en el torneo o si se encuentra dado de baja:
    ```tsx
    <span className="team-profile-status">
      {team.isActive ? 'Equipo activo' : 'Equipo inactivo'}
    </span>
    ```

- **Integración de Multi OP.GG (`multiOpggUrl`)**:
  - Agrupa los Riot IDs (`${gameName}#${tag}`) de todos los jugadores de la plantilla (`team.members` con roles deportivos), normaliza los tags eliminando prefijos `#`, deduplica los nombres invocadores mediante `Set` y construye de forma segura la URL de consulta hacia la herramienta multianálisis externa:
    ```typescript
    const summoners = players.flatMap((player) => {
      const gameName = player.gameName?.trim();
      const tag = player.riotTag?.trim().replace(/^#/, '').trim();
      return gameName && tag ? [`${gameName}#${tag}`] : [];
    });
    const multiOpggUrl = summoners.length
      ? `https://op.gg/es/lol/multisearch/euw?${new URLSearchParams({ summoners: [...new Set(summoners)].join(',') })}`
      : null;
    ```
  - **Botón Interactivo de Marca (`team-profile-opgg`)**: Renderiza el logotipo oficial de OP.GG envuelto en un enlace seguro con atributos `target="_blank"`, `rel="noopener noreferrer"` y etiqueta descriptiva `aria-label={`Ver Multi OP.GG de ${team.name} (nueva pestaña)`}`.

- **Información Institucional y Clasificación de Miembros (`MemberSection`)**:
  - **Panel Descriptivo (`team-profile-info`)**: Lista de cuatro dimensiones institucionales (`<dl>`): nombre de la entidad, división, temporada y recuento total de jugadores.
  - **Sección `Jugadores`**: Filtra integrantes clasificados bajo `playerRoles` (`'top'`, `'jungle'`, `'mid'`, `'adc'`, `'support'`, `'substitute'`). Aplica ordenación canónica por posición de juego y desempate alfabético en locale `'es'`.
    - Cada tarjeta (`team-member-card team-player-card`) expone las estadísticas del jugador en la plantilla (`rosterStats`: partidas jugadas, galardones de MVP y campeones únicos utilizados).
    - Distintivo visual para el capitán (`member.isCaptain`, clase `is-captain` y etiqueta `team-player-captain`).
    - Enlace al perfil individual del jugador (`/jugadores/:playerSlugOrId`) mediante `SiteLink` y botón directo a su perfil individual en OP.GG (`team-member-opgg`).
  - **Secciones de Cuerpo Técnico y Colaboradores**: Bloques independientes para `Coach` (`role === 'coach'`), `Staff` (`role === 'staff'`) y `Partners` (`role === 'partners'`), garantizando la representación completa de la estructura del club.

---

### 3.9 `PlayerDetailPage` (Ficha de Detalle de Jugador)
**Archivo**: `site/pages/player-details/PlayerDetailPage.tsx:1-292`

Orquesta la ficha de perfil de un competidor, centralizando su identidad en Riot Games, sus estadísticas acumuladas en el torneo, la vinculación de cuentas secundarias (*smurfs* / secundarias) y su historial cronológico de inscripciones.

- **Ciclo de Vida y Estados Asíncronos**:
  - Consume `useCompetitionDetail('players', playerId)`.
  - Actualiza reactivamente el título de la pestaña (`document.title = `${state.data.gameName} · Rebel Crown Legacy``).
  - Gestiona los estados en `PageLayout`: `'loading'`, `'missing'` ("Jugador no encontrado. Puede que ya no esté disponible."), `'error'` con reintento (`retry`) y `'ready'` renderizando `PlayerProfile`.

- **Cabecera de Identidad (`player-profile-header`)**:
  - Aplica la variable CSS `--profile-color` vinculada al color corporativo del equipo más reciente (`registrationTeam?.color || 'var(--purple)'`).
  - Distingue la naturaleza de la cuenta: `{player.isMain ? 'Cuenta principal' : 'Cuenta registrada'}`.
  - Presenta el Riot ID canónico (`${player.gameName}#${tag}`), el nombre de comunidad en Discord (`displayName(player.displayName ?? 'Jugador RCL')`), el rol habitual y el distintivo de capitán (`player-captain-label`).
  - Integra enlace directo a OP.GG (`player-profile-opgg`) con atributos seguros `target="_blank"`, `rel="noopener noreferrer"` y etiqueta de accesibilidad.
  - Enlace al equipo competitivo resuelto por la API (`player-profile-team`, `player.registrationTeam`). Sin inscripción se muestran iniciales y «Sin equipo competitivo». No se usa `player.teams[0]`; la cabecera identifica el equipo inactivo cuando corresponde.

- **Sección de Cuentas Secundarias Vinculadas (`player-linked-accounts`)**:
  - Contenedor accesible identificado semánticamente mediante `aria-labelledby="player-accounts-title"`, con encabezado `"Cuentas secundarias"` y subtítulo `"Cuentas del mismo jugador"`.
  - Itera sobre el listado `player.linkedAccounts` (cuentas adicionales asociadas a la misma identidad deportiva):
    - Presenta la tarjeta de membresía vinculada (`player-profile-membership player-linked-account`).
    - Etiqueta de relación clara: `{account.isMain ? 'Cuenta principal' : 'Cuenta secundaria'}`.
    - Información de la cuenta en un contenedor no interactivo, sin navegación a otra ficha de jugador.
    - Nombre del invocador y Riot ID formateado (`${account.gameName}#${accountTag}`).
    - Enlace individual a la herramienta externa OP.GG (`https://op.gg/es/lol/summoners/euw/...`) con apertura en nueva pestaña (`target="_blank"`, `rel="noopener noreferrer"`) y accesibilidad (`aria-label={`Ver OP.GG de ${account.gameName} (nueva pestaña)`}`).
  - **Estado Vacío Semántico**: Cuando el arreglo `linkedAccounts` no contiene elementos o es indefinido, renderiza un mensaje informativo limpio:
    ```tsx
    <div className="empty-state">No hay otras cuentas vinculadas a este jugador.</div>
    ```

- **Sección de Rendimiento Deportivo (`player-performance`)**:
  - Definición de métricas: `PlayerDetailPage.tsx:81-94`; representación y estado vacío: `PlayerDetailPage.tsx:215-254`. La cuadrícula aparece si hay partidas o MVPs; los premios se muestran incluso sin estadísticas.
  - Cuadrícula con 8 métricas de rendimiento (`player-performance-grid`): Partidas, KDA, % Victorias, MVPs conseguidos (`player.competition?.mvpMatchIds.length`), CS/minuto, Participación en kills %, Daño/minuto y Puntuación de visión. Formateo en español (`'es'`) con un máximo de 2 dígitos fraccionarios.
  - Campeón insignia (`player-signature-champion`): Muestra el campeón más jugado por el usuario en la competición (`player.competition?.champion`).
  - Estado vacío de rendimiento (`player-performance-empty`): «Sin partidas registradas». El contexto procede de `statisticsSeasonName`; sin temporada ni resultados se indica «No hay partidas ni premios registrados para este jugador». Los MVPs persistidos se conservan aunque falten estadísticas.

- **Equipos y vinculaciones (`player-teams`)**:
  - Recorre el arreglo `player.teams` (`PlayerTeam[]`), reuniendo roles competitivos, coach, staff y partners en una única sección, en el orden recibido de la API. El estado vacío es «Este jugador todavía no tiene inscripciones en equipos».
  - Cada fila enlaza a la ficha del club (`/equipos/:slugOrId`), muestra el escudo (`TeamBadge`), temporada, división, rol desempeñado y condición de capitán.
  - Comparte cuadrícula y altura mínima con las cuentas secundarias. El logo se sitúa a la derecha y el nombre ocupa una línea con puntos suspensivos, conservando el texto completo en `title`. El indicador de inactividad se reserva a la cabecera.
