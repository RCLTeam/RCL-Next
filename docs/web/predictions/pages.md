# Vistas Ensambladoras (Smart Pages): Match Predictions

[⬅️ Volver a Hooks](hooks.md) | [Siguiente: Tipos ➡️](types.md)

---

## 1. Visión General de la Smart Page

La vista de quinielas se ensambla en el componente `PredictionsPage` (`apps/web/src/site/pages/predictions/PredictionsPage.tsx`).

Como **Smart Page**, no implementa lógica de bajo nivel de renderizado de tarjetas ni realiza llamadas directas a `fetch`. Su función es orquestar la integración entre cuatro subsistemas:
1. **Autenticación (`useAuth`):** Resuelve si el visitante es un usuario anónimo o un miembro autenticado mediante Discord.
2. **Contexto de Competición (`useCompetition`):** Proporciona la división deportiva activa, la temporada, el calendario de partidos y el catálogo de jornadas (`rounds`).
3. **Sincronización de Predicciones (`usePredictions`):** Consume los resúmenes de la jornada solicitada, la jornada actual persistente y los votos del usuario.
4. **Presentación Accesible (`PageLayout` y `DataState`):** Envuelve la interfaz en la plantilla estándar de la liga, gestionando estados de carga, error y lista vacía.

---

## 2. Orquestación y Ciclo de Vida (`PredictionsPage`)

```tsx
// apps/web/src/site/pages/predictions/PredictionsPage.tsx
export function PredictionsPage({ competition }: { competition: Competition }) {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.user.discordId : undefined;
  const [roundChoice, setRoundChoice] = useState('');
  const roundKey = `${competition.division?.id ?? ''}:`;
  const selectedRound = roundChoice.startsWith(roundKey) ? roundChoice.slice(roundKey.length) : '';
  const predictions = usePredictions(competition.division?.id, userId, selectedRound || undefined);
  const data = predictions.data;
  const rounds = selectableRounds(competition.rounds.data, predictions.currentRound);
  const shownRound = competition.rounds.data.find((round) => round.id === data?.round);
  const matches =
    data?.matches.flatMap((summary) => {
      const match = competition.calendar.data.find((m) => m.id === summary.matchId);
      return match && isActiveTeam(match.homeTeam) && isActiveTeam(match.awayTeam)
        ? [{ match, summary }]
        : [];
    }) ?? [];
```

### Flujo de Datos:
1. **Resolución de Identidad:** Obtiene `userId = state.user.discordId` si la sesión de Discord está activa; de lo contrario, `userId` es `undefined`.
2. **Carga de Recursos en la Ruta:** La ruta `/predicciones` en `siteRoutes` declara explícitamente `competition: ['calendar', 'rounds']`, garantizando la carga concurrente tanto del calendario de partidos como de la lista oficial de jornadas de la división (`competition.rounds.data`).
3. **Selección Keyed de Jornada:** El estado local `roundChoice` almacena la selección vinculada a la división mediante una clave compuesta con prefijo `${divisionId}:${roundId}` (`${competition.division?.id ?? ''}:${selectedRound}`). Si el usuario cambia de división, la clave deja de coincidir (`roundChoice.startsWith(roundKey)`), reseteando de inmediato la selección y adoptando la jornada actual de la nueva división por defecto sin disparar peticiones incoherentes con IDs de jornada cruzados.
4. **Sincronización Reactiva:** Invoca `usePredictions(competition.division?.id, userId, selectedRound || undefined)`, propagando automáticamente los cambios de división o de jornada al cliente de red.
5. **Cruce Relacional con el Calendario:** Cruza los resúmenes de predicción devueltos por la API (`data.matches`) con los partidos completos del calendario de competición (`competition.calendar.data`), comprobando además la actividad de ambos equipos participantes (`isActiveTeam(match.homeTeam) && isActiveTeam(match.awayTeam)`), descartando automáticamente enfrentamientos de equipos inactivos o series canceladas.

---

## 3. Elementos de la Interfaz Orquestada

### 3.1 Barra de Herramientas, Selector de Jornadas y Estado de Votación
Integra el componente `CompetitionFilters` para conmutar de división y renderiza el selector de jornadas `RoundFilter`:
- **Jornadas Seleccionables con `selectableRounds`:** El selector recibe `rounds={selectableRounds(competition.rounds.data, predictions.currentRound)}`. Esta función auxiliar pura, ubicada en `apps/web/src/features/predictions/selectable-rounds.ts`, cuenta con la firma:
  ```typescript
  export function selectableRounds(rounds: readonly Round[], currentRoundId: string | null): Round[]
  ```
  Filtra las jornadas hasta la jornada actual, ordenadas cronológicamente de la más antigua a la actual (`startsAt` ascendente), y **garantiza que nunca aparezcan jornadas futuras**.
- **Valor por Defecto:** Utiliza prioritariamente la jornada seleccionada, recurriendo por defecto a `data.round` (la jornada actual devuelta por la API) o `predictions.currentRound`:
  ```tsx
  <RoundFilter
    rounds={rounds}
    value={selectedRound || data?.round || predictions.currentRound || ''}
    onChange={(value) => setRoundChoice(`${roundKey}${value}`)}
  />
  ```
- **Insignia Visual de Estado:** Refleja la disponibilidad de las votaciones:
  ```tsx
  <span className={`prediction-status${data?.open ? ' is-open' : ''}`}>
    {data
      ? data.open
        ? 'Votaciones abiertas · Hasta 1 hora antes de cada partido'
        : 'Sin partidos abiertos para votar'
      : predictions.error
        ? 'Predicciones no disponibles'
        : 'Cargando predicciones…'}
  </span>
  ```

### 3.2 Indicador Temporal y Rótulo de Jornada
Muestra el rótulo de la jornada activa o seleccionada mediante el metadato oficial `shownRound.name` (o `Jornada ${shownRound.sequence}`). Si ninguna jornada coincide en el catálogo, aplica el respaldo histórico con formato de fecha UTC:
```tsx
{data && (
  <p className="prediction-week eyebrow">
    {shownRound ? (
      (shownRound.name ?? `Jornada ${shownRound.sequence}`)
    ) : (
      <>
        Semana del{' '}
        {new Intl.DateTimeFormat('es-ES', {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC'
        }).format(new Date(`${data.week}T00:00:00Z`))}
      </>
    )}
  </p>
)}
```

### 3.3 Llamada a la Acción para Usuarios Anónimos
Si la votación está abierta pero el usuario no ha iniciado sesión, muestra un aviso accesible con enlace directo al inicio de sesión mediante OAuth2 de Discord:
```tsx
{state.status === 'anonymous' && data?.open && (
  <p className="prediction-login">
    <a href={discordLoginUrl}>Inicia sesión con Discord</a> para guardar tus predicciones.
  </p>
)}
```

### 3.4 Cuadrícula de Partidos y Resiliencia con `DataState`
El contenedor `<DataState>` unifica los estados de error y carga de las predicciones y del calendario de la competición:
- Ante fallos de red, ofrece un botón de reintento que invoca concurrentemente `predictions.retry()` y `competition.retry()`.
- Si no hay encuentros programados para la jornada consultada en esa división, presenta el mensaje vacío:
  `"No hay encuentros programados para esta jornada en esta división."`
- Divide los partidos en dos secciones claramente delimitadas:
  - **Abiertas para votar:** Partidos donde el plazo de votación sigue activo.
  - **Votaciones cerradas:** Partidos bloqueados (a menos de una hora de su inicio o finalizados).
- Renderiza la cuadrícula `.prediction-grid` iterando sobre cada serie, mapeando el voto propio existente (`predictions.picks.find((p) => p.matchId === match.id)`) y pasando la función de persistencia `save={predictions.save}` a cada `PredictionCard`.

### 3.5 Clasificación General y Reglas
- **`PredictorRankingPanel`:** Monta el ranking de pronosticadores (`data.ranking`), pasando la temporada actual y el identificador de usuario para destacar su fila personal.
- **`PredictionRules`:** Expone al pie de página las normas de puntuación y plazos horarios oficiales.
