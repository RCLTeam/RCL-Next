# Componentes de Presentación (Dumb UI)

[⬅️ Volver a Web Competition](README.md) | [Siguiente: Hooks Headless ➡️](hooks.md)

---

## 1. Visión General

El directorio `apps/web/src/features/competition/components/` alberga los componentes puramente visuales (*Dumb Components*) del motor de competición.

En estricta conformidad con el **Golden Standard Arquitectónico**, la totalidad de estos 10 componentes satisface la regla de oro:
> **0 llamadas a la red:** Queda estrictamente prohibido invocar `fetch`, `WebSocket`, `XMLHttpRequest` o librerías de transporte dentro de los componentes visuales. Toda mutación y flujo de datos se canaliza a través de *props* tipadas y *callbacks*.

---

## 2. Catálogo de los 10 Componentes Dumb UI

| # | Componente | Archivo | Líneas | Llamadas Red | Responsabilidad Visual |
|:---:|---|---|:---:|:---:|---|
| 1 | `StandingsTable` | `StandingsTable.tsx` | 50 | **0** | Tabla accesible de clasificación de la fase regular. |
| 2 | `MatchCard` | `MatchCard.tsx` | 177 | **0** | Tarjeta de partido con anti-spoiler y enlaces seguros de streaming. |
| 3 | `TeamCard` | `TeamCard.tsx` | 24 | **0** | Tarjeta de equipo con variable CSS temática de color. |
| 4 | `TeamBadge` | `TeamBadge.tsx` | 51 | **0** | Emblema de equipo con triple degradación ante fallos y delimitación CLS. |
| 5 | `DivisionCard` | `DivisionCard.tsx` | 58 | **0** | Tarjeta interactiva de división en modalidades botón y enlace. |
| 6 | `DivisionSwitch` | `DivisionSwitch.tsx` | 24 | **0** | Barra selectora de botones para alternar entre divisiones. |
| 7 | `PlayoffBracket` | `PlayoffBracket.tsx` | 50 | **0** | Cuadro visual de eliminatorias por columnas de jornadas. |
| 8 | `RoundFilter` | `RoundFilter.tsx` | 28 | **0** | Selector desplegable accesible para filtrado por jornada. |
| 9 | `CompetitionFilters` | `CompetitionFilters.tsx` | 61 | **0** | Barra de herramientas que agrupa selección de temporada y división. |
| 10 | `CompetitionDataState`| `CompetitionDataState.tsx`| 25 | **0** | Contenedor de estados asíncronos con resolución jerárquica de dependencias. |

---

## 3. Especificación Técnica por Componente

### 3.1 `StandingsTable`
**Archivo**: `StandingsTable.tsx:1-52`  
**Props**: `{ rows: Standing[] }`

- **Accesibilidad**: Envuelto en `<section className="table-scroll" aria-label="Tabla de clasificación" tabIndex={0}>`, permitiendo que usuarios que navegan por teclado puedan realizar *scroll* horizontal sobre tablas anchas.
- **Filtrado Reactivo de Clubes Inactivos**: Aplica `isActiveTeam(row.team)` (`apps/web/src/features/competition/team-visibility.ts:9-11`) para purgar de la tabla aquellos clubes que no posean un identificador activo de rol de Discord (`BigInt(roleId) >= 0n`).
  ```typescript
  const activeRows = rows.filter((row) => isActiveTeam(row.team));
  ```
- **Re-enumeración Secuencial del Rango (`rank`)**: Al iterar sobre el arreglo filtrado `activeRows`, calcula la posición como `index + 1` (`línea 26`) en lugar de depender del índice estático `row.position` de la base de datos, garantizando una numeración continua sin saltos aunque existan clubes inactivos intercalados:
  ```tsx
  <td className="rank">{index + 1}</td>
  ```
- **Columnas**: Posición (`Pos`), Equipo, Partidos Jugados (`PJ`), Victorias (`V`), Derrotas (`D`), Mapas a Favor (`Mapas +`), Mapas en Contra (`Mapas −`) y Diferencia de Mapas.
- **Formateo de Signo**: La diferencia de mapas añade el prefijo explícito `+` para valores positivos (`row.mapDifference > 0 ? '+' : ''`, `líneas 42-44`).
- **Navegación**: Enlaza el nombre del equipo hacia `/equipos/:slugOrId` usando `SiteLink`.

### 3.2 `MatchCard`
**Archivo**: `MatchCard.tsx:1-177`  
**Props**: `{ match: Match }`

- **Mecanismo Anti-Spoiler**:
  ```tsx
  // MatchCard.tsx:107-113
  <label className="match-score-spoiler">
    <input type="checkbox" className="spoiler-toggle" />
    <span className="spoiler-cover">HAZ CLIC PARA VER MÁS</span>
    <strong className="match-score">{`${match.homeScore} – ${match.awayScore}`}</strong>
  </label>
  ```
  Permite al usuario ocultar el resultado por defecto y revelarlo bajo demanda sin JavaScript imperativo, valiéndose de selectores CSS `:checked`.
- **Seguridad en URLs de Emisión (`safeStreamUrl`)**: La función `safeStreamUrl` filtra cualquier protocolo no seguro (`http:` externo, `javascript:`, `data:`), admitiendo únicamente `https:` y entornos de desarrollo locales (`http://localhost`, `http://127.0.0.1`).
- **Iconografía Condicional**: Detecta si la transmisión pertenece a YouTube o Twitch y renderiza los iconos SVG correspondientes (`TwitchIcon`, `YoutubeIcon`, `líneas 16-46, 142-170`).
- **Estados de Partido Traducidos**:
  ```typescript
  export const matchStatus: Record<Match['status'], string> = {
    scheduled: 'Programado',
    live: 'En directo',
    completed: 'Finalizado',
    forfeit: 'Incomparecencia',
    cancelled: 'Cancelado'
  };
  ```
- **Navegación a Detalle**: Solo renderiza el enlace profundo `/partidos/:slugOrId` si el partido se encuentra en estado `'completed'` o `'forfeit'` (`líneas 65-71`).

### 3.3 `TeamCard`
**Archivo**: `TeamCard.tsx:1-24`  
**Props**: `{ team: Team; divisionName?: string }`

- Inyecta la variable CSS `--team-color` con el color corporativo del equipo (`team.color || 'var(--panel)'`).
- Renderiza el `TeamBadge`, el acrónimo `shortName` (fallback a `'RCL'`) y el nombre completo.
- Enlace semántico accesible con `aria-label="Ver equipo <nombre>"`.

### 3.4 `TeamBadge`
**Archivo**: `TeamBadge.tsx:1-51`  
**Props**: `{ team?: Team | null }`

- **Triple Nivel de Degradación Resiliente**:
  1. Intenta cargar el escudo oficial resuelto (`resolveTeamLogo(team?.logoUrl)`).
  2. Si la imagen falla en red (`onError`), conmuta automáticamente a `/images/teams_logo/placeholder.webp` (`líneas 19-21, 41`).
  3. Si el placeholder también falla, degrada a las 3 primeras letras del nombre o acrónimo en mayúsculas (`línea 47`).
- **Estabilidad de Diseño (Anti-CLS)**: Consume `teamLogoBounds` (`apps/web/src/shared/resources/team-logo-bounds.ts`) para fijar la anchura y altura exactas del contenedor de la imagen, previniendo saltos en la interfaz durante la carga asíncrona de recursos gráficos.

### 3.5 `DivisionCard`
**Archivo**: `DivisionCard.tsx:1-58`  
**Props**: `DivisionCardProps`

- **Modo Dual**: Si se proporciona `onClick` sin `href`, renderiza un `<button type="button">`. Si se define `href`, renderiza un `SiteLink` navegable (`líneas 44-56`).
- **Resolución Gráfica**: Mapea la clave de imagen contra `brandAssets[image]` (ej. logos de Premier o Segunda).
- **Textos de Categoría por Defecto**: Asigna descripciones predeterminadas para las categorías Premier y cantera si no se suministran explícitamente.

### 3.6 `DivisionSwitch`
**Archivo**: `DivisionSwitch.tsx:1-24`  
**Props**: `{ competition: Competition }`

- Renderiza un grupo de botones dentro de un `<fieldset className="league-switch" aria-label="Seleccionar división">`.
- Accesibilidad ARIA: Marca el botón de la división activa mediante `aria-pressed={competition.division?.id === division.id}`.
- Invoca `competition.selectDivision(division.id)` al interactuar.

### 3.7 `PlayoffBracket`
**Archivo**: `PlayoffBracket.tsx:1-50`  
**Props**: `{ rounds: Round[]; matches: Match[] }`

- Contenedor con desplazamiento accesible por teclado (`tabIndex={0}`, `aria-label="Cruces de playoffs"`).
- Renderiza una cuadrícula de columnas (`bracket-column`), una por cada jornada de eliminatorias, listando los enfrentamientos con sus puntuaciones y estado (BO3/BO5).
- Si una jornada no tiene partidos asignados aún, muestra el estado vacío `"Cruces por confirmar"` (`líneas 41-43`).

### 3.8 `RoundFilter`
**Archivo**: `RoundFilter.tsx:1-28`  
**Props**: `{ rounds: Round[]; value: string; onChange: (value: string) => void }`

- Desplegable basado en el componente compartido `Select`.
- Se deshabilita automáticamente si la lista de jornadas está vacía (`disabled={!rounds.length}`).
- Emite el identificador seleccionado mediante el callback `onChange`.

### 3.9 `CompetitionFilters`
**Archivo**: `CompetitionFilters.tsx:1-61`  
**Props**: `{ competition: Competition; children?: ReactNode; divisionControl?: 'buttons' | 'select' }`

- Proporciona la barra superior unificada para páginas de competición.
- Incluye el selector de temporadas y conmuta la visualización de divisiones entre botones interactivos (`DivisionSwitch`) o menú desplegable (`Select`) según el parámetro `divisionControl`.
- Admite contenido adicional en su slot `children` para búsquedas o metadatos de jornada.

### 3.10 `CompetitionDataState`
**Archivo**: `CompetitionDataState.tsx:1-25`  
**Props**: `DataStateProps<T>`

- **Resolución Jerárquica de Estado (`resolveCompetitionState`)**:
  ```typescript
  export function resolveCompetitionState<T>(
    competition: Competition,
    state: CollectionState<T>
  ): CollectionState<T> {
    const parent =
      competition.seasons.status !== 'ready' ? competition.seasons : competition.divisions;
    return parent.status !== 'ready' ? { status: parent.status, data: [] } : state;
  }
  ```
  Evita inconsistencias visuales: si las temporadas o las divisiones aún están cargando o en error, el componente subordina el estado del contenido hijo al del recurso padre.

### 3.11 `MatchMatchupsSection`
**Archivo**: `site/pages/match-details/components/MatchMatchupsSection/MatchMatchupsSection.tsx:1-151`  
**Estilos**: `site/pages/match-details/components/MatchMatchupsSection/match-matchups-section.css:1-316`  
**Props**: `{ game: MatchMap | undefined; match: MatchDetail; catalog: GameCatalog }`

Renderiza la comparativa táctica cara a cara entre los dos equipos de un mapa específico, agrupando a los jugadores carril por carril y ofreciendo inspección detallada de builds de objetos, hechizos de invocador y árboles de runas.

- **Emparejamiento Calle por Calle (`positionRows`)**:
  Consume la utilidad `positionRows(participants, homeTeamId, awayTeamId)` (`apps/web/src/site/pages/match-details/match-stats.ts:10-30`) para estructurar los enfrentamientos directos:
  1. Itera sobre las posiciones competitivas canónicas: `TOP`, `JUNGLE`, `MID`, `ADC`, `SUPPORT` y la categoría de contingencia `SIN POSICIÓN` (para participantes con roles no tipados o mapas atípicos).
  2. Empareja a los jugadores de cada equipo (`home` y `away`) que compartan carril, calculando el tamaño del enfrentamiento como `Math.max(home.length, away.length)` para admitir alineaciones con sustituciones o múltiples integrantes por rol.
  3. Cada fila (`match-lane-row`) expone el componente `PlayerSummary` del equipo local, el icono visual del carril (`match-lane-label` con `GameIcon kind="position"`) y el componente `PlayerSummary` del equipo visitante.

- **Algoritmo de Compactación de Objetos (`PlayerSummary`)**:
  Para prevenir huecos visuales nulos entre las casillas de la build del jugador (slots `item0` a `item5`), el componente `PlayerSummary` (`líneas 21-25`) normaliza el inventario desplazando todos los objetos adquiridos hacia las primeras posiciones:
  ```typescript
  const slots = ['item0', 'item1', 'item2', 'item3', 'item4', 'item5'] as const;
  const items = slots.map((slot) => build?.[slot] ?? null);
  const orderedItems = [...items.filter((id) => id), ...items.filter((id) => !id)];
  ```
  Al iterar sobre `orderedItems`, los iconos de objetos comprados (`GameIcon kind="item"`) ocupan un bloque compacto continuo y las casillas vacías (`null`) quedan agrupadas ordenadamente al final.

- **Simetría Visual en CSS (Convergencia hacia el Centro)**:
  En `match-matchups-section.css`, la disposición visual de los dos bandos se equilibra en espejo respecto a la columna central de posición:
  - **Bando Izquierdo (`.player-summary:first-child`)**:
    - Contenedor de slots en dirección estándar (`ltr`).
    - Cuadrícula de objetos (`.items-group`): aplica `direction: rtl` (`línea 174`), provocando que los ítems se listen de derecha a izquierda, acercándose hacia el centro de la pantalla.
  - **Bando Derecho (`.player-summary:last-child`)**:
    - Contenedor de slots (`.player-summary-slots`) y subtítulo (`.player-summary-caption`): aplican `direction: rtl` (`líneas 278-281`).
    - Cuadrícula de objetos (`.items-group`): conmuta a `direction: ltr` (`línea 263`), ordenando los objetos de izquierda a derecha.
    - Gradiente de fondo invertido (`linear-gradient(to right, color-mix(in srgb, var(--lime) 5%, var(--panel)), var(--panel))`).
  - **Efecto de Convergencia**: Tanto los iconos de campeón como los bloques de objetos de ambos contrincantes convergen visualmente hacia la etiqueta central de la calle (`match-lane-label`), aportando una estética de enfrentamiento directo de alta fidelidad.

- **Diálogo Modal de Runas (`MatchRunesDialog`)**:
  - Cada tarjeta de jugador se materializa como un botón accesible (`<button type="button" className="player-summary" aria-haspopup="dialog" ...>`).
  - Al interactuar (`onClick={() => onSelect(player)}`), activa el estado local `runePlayer` en `MatchMatchupsSection` (`líneas 81, 124, 133`).
  - Despliega `MatchRunesDialog` (`apps/web/src/site/pages/match-details/components/MatchRunesSection/MatchRunesSection.tsx`), presentando el árbol primario y secundario de runas con sus runas clave, runas menores y fragmentos de estadísticas (*stat shards*).

### 3.12 Filtros de Visibilidad en Componentes Deportivos
**Archivo**: `apps/web/src/features/competition/team-visibility.ts:1-16`

Centraliza la lógica para determinar qué clubes deben presentarse en tablas clasificatorias, directorios y calendarios, evitando que equipos inactivos o clubes fantasma desvirtúen la experiencia competitiva.

- **Definición de las Reglas de Visibilidad**:
  ```typescript
  type TeamRole = { discordRoleId?: string | null };

  function hasRoleAtLeast(team: TeamRole | undefined, minimum: bigint): boolean {
    const roleId = team?.discordRoleId;
    return Boolean(roleId && BigInt(roleId) >= minimum);
  }

  export function isActiveTeam(team: TeamRole | undefined): boolean {
    return hasRoleAtLeast(team, 0n);
  }

  export function isTeamVisibleInCalendar(team: TeamRole | undefined): boolean {
    return hasRoleAtLeast(team, -10n);
  }
  ```
  - `isActiveTeam`: Exige que `discordRoleId` exista y sea un copo de nieve (*snowflake*) numérico mayor o igual a `0n`. Cualquier valor negativo o nulo marca al equipo como inactivo.
  - `isTeamVisibleInCalendar`: Admite valores de rol hasta `-10n`. Esto permite que equipos formalmente retirados de la competición durante la temporada (con identificadores convencionales de penalización como `-10`) sigan figurando en los enfrentamientos disputados del calendario para no mutilar el historial de resultados de sus rivales, mientras descarta completamente equipos fantasma sin rol asignado.

- **Consumo en Componentes del Frontend**:
  1. `StandingsTable` (`apps/web/src/features/competition/components/StandingsTable.tsx:8`):
     Filtra las filas mediante `rows.filter((row) => isActiveTeam(row.team))`. Los clubes retirados o inactivos no computan en la tabla regular y las posiciones se re-enumeran secuencialmente.
  2. `TeamGrid` (`apps/web/src/site/pages/teams/TeamGrid.tsx:13`):
     Filtra los equipos del directorio con `teams.filter(isActiveTeam)`. Si ningún club activo coincide con la búsqueda, muestra el estado vacío correspondiente.
  3. `MatchList` (`apps/web/src/site/pages/calendar/MatchList.tsx:7-9`):
     Aplica `isTeamVisibleInCalendar(match.homeTeam) && isTeamVisibleInCalendar(match.awayTeam)` para asegurar que ambos contendientes tengan visibilidad válida en el calendario.
  4. `PredictionCard` (`apps/web/src/site/pages/predictions/PredictionCard.tsx:37, 75, 161-163`):
     Evalúa `const eligible = isActiveTeam(match.homeTeam) && isActiveTeam(match.awayTeam);`.
     - Si alguno de los clubes contendientes es inactivo (`!eligible`), deshabilita completamente el formulario de votación de la serie.
     - Presenta el aviso explícito de restricción al usuario:
       ```tsx
       {!eligible && (
         <p className="prediction-notice">Predicciones no disponibles para equipos inactivos.</p>
       )}
       ```
