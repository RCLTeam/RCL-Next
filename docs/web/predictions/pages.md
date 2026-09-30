# Vistas Ensambladoras (Smart Pages): Match Predictions

[⬅️ Volver a Hooks](hooks.md) | [Siguiente: Tipos ➡️](types.md)

---

## 1. Visión General de la Smart Page

La vista de quinielas se ensambla en `PredictionsPage.tsx` (`apps/web/src/site/pages/predictions/PredictionsPage.tsx:1-100`).

Como **Smart Page**, no implementa lógica de bajo nivel de renderizado de tarjetas ni realiza llamadas directas a `fetch`. Su función es orquestar la integración entre cuatro subsistemas:
1. **Autenticación (`useAuth`):** Resuelve si el visitante es un usuario anónimo o un miembro autenticado mediante Discord.
2. **Contexto de Competición (`useCompetition`):** Proporciona la división activa, la temporada y el calendario de partidos.
3. **Sincronización de Predicciones (`usePredictions`):** Consume los resúmenes de la jornada y los votos del usuario.
4. **Presentación Accesible (`PageLayout` y `DataState`):** Envuelve la interfaz en la plantilla estándar de la liga, gestionando estados de carga, error y lista vacía.

---

## 2. Orquestación y Ciclo de Vida (`PredictionsPage.tsx`)

```tsx
// apps/web/src/site/pages/predictions/PredictionsPage.tsx:16-33
export function PredictionsPage({ competition }: { competition: Competition }) {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.user.discordId : undefined;
  const predictions = usePredictions(competition.division?.id, userId);
  const data = predictions.data;
  const matches =
    data?.matches.flatMap((summary) => {
      const match = competition.calendar.data.find((m) => m.id === summary.matchId);
      return match ? [{ match, summary }] : [];
    }) ?? [];
```

### Flujo de Datos:
1. **Resolución de Identidad:** Obtiene `userId = state.user.discordId` si la sesión de Discord está activa; de lo contrario, `userId` es `undefined`.
2. **Sincronización por División:** Invoca `usePredictions(competition.division?.id, userId)`, vinculando la reactividad al cambio de división en los selectores de cabecera.
3. **Cruce Relacional con el Calendario:** Cruza los resúmenes de predicción devueltos por la API (`data.matches`) con los partidos completos del calendario de competición (`competition.calendar.data`), descartando enfrentamientos no coincidentes o cancelados.

---

## 3. Elementos de la Interfaz Orquestada

### 3.1 Barra de Herramientas y Estado de Jornada (Líneas 34-46)
Integra el componente `CompetitionFilters` para conmutar de división deportiva e inyecta la insignia visual de estado de votación:
- Si la jornada está abierta:
  ```tsx
  <span className="prediction-status is-open">
    Votaciones abiertas · Hasta el martes 23:59
  </span>
  ```
- Si la jornada está cerrada:
  ```tsx
  <span className="prediction-status">
    Votaciones cerradas · Abren el lunes 00:00
  </span>
  ```

### 3.2 Indicador Temporal de Semana (Líneas 47-56)
Formatea de manera determinista la fecha del lunes de la jornada mediante hora UTC:
```tsx
<p className="prediction-week eyebrow">
  Semana del{' '}
  {new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(new Date(`${data.week}T00:00:00Z`))}
</p>
```

### 3.3 Llamada a la Acción para Usuarios Anónimos (Líneas 57-61)
Si la votación está abierta pero el usuario no ha iniciado sesión, muestra un aviso discreto con enlace directo al handshake OAuth2 de Discord:
```tsx
{state.status === 'anonymous' && data?.open && (
  <p className="prediction-login">
    <a href={discordLoginUrl}>Inicia sesión con Discord</a> para guardar tus predicciones.
  </p>
)}
```

### 3.4 Cuadrícula de Partidos y Resiliencia con `DataState` (Líneas 62-88)
El contenedor `<DataState>` unifica los estados de error y carga de las predicciones y del calendario de la competición:
- Si hay un error, ofrece un botón que invoca concurrentemente `predictions.retry()` y `competition.retry()`.
- Si no hay partidos programados para esa semana, presenta el mensaje vacío: *"No hay encuentros programados para esta semana en esta división."*
- Renderiza la cuadrícula `.prediction-grid` iterando sobre cada serie, mapeando el voto propio existente (`picks.find(p => p.matchId === match.id)`) y pasando la función de persistencia `save={predictions.save}` a cada `PredictionCard`.

### 3.5 Clasificación General y Reglas (Líneas 89-97)
- **`PredictorRankingPanel`:** Monta el ranking de pronosticadores (`data.ranking`), pasando la temporada actual y el identificador de usuario para destacar su fila personal.
- **`PredictionRules`:** Expone al pie de página las normas de puntuación y plazos horarios oficiales.
