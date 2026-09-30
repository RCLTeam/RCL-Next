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
**Archivo**: `StandingsTable.tsx:1-50`  
**Props**: `{ rows: Standing[] }`

- **Accesibilidad**: Envuelto en `<section className="table-scroll" aria-label="Tabla de clasificación" tabIndex={0}>`, permitiendo que usuarios que navegan por teclado puedan realizar *scroll* horizontal sobre tablas anchas.
- **Columnas**: Posición (`Pos`), Equipo, Partidos Jugados (`PJ`), Victorias (`V`), Derrotas (`D`), Mapas a Favor (`Mapas +`), Mapas en Contra (`Mapas −`) y Diferencia de Mapas.
- **Formateo de Signo**: La diferencia de mapas añade el prefijo explícito `+` para valores positivos (`row.mapDifference > 0 ? '+' : ''`, `líneas 40-41`).
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
- **Estabilidad de Diseño (Anti-CLS)**: Consume `teamLogoBounds` (`team-logo-bounds.ts`) para fijar la anchura y altura exactas del contenedor de la imagen, previniendo saltos en la interfaz durante la carga asíncrona de recursos gráficos.

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
