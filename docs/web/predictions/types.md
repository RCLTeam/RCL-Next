# Tipos y Contratos de Interfaz: Match Predictions

[⬅️ Volver a Páginas](pages.md) | [Volver al Índice de Web Predictions ⬆️](README.md)

---

## 1. Visión General de Tipos en el Frontend

La capa web del módulo de predicciones define contratos de interfaz para las propiedades de sus componentes visuales, el retorno de sus hooks headless y el consumo de modelos compartidos del paquete `@rcl/contracts`.

---

## 2. Tipos de Componentes y Hooks

### 2.1 `PredictionCardProps`
Contrato de propiedades requerido por la tarjeta de pronóstico `PredictionCard.tsx`:

```typescript
interface PredictionCardProps {
  match: Match;
  summary: PredictionSummary;
  pick?: PredictionPick | undefined;
  authenticated: boolean;
  save: (pick: PredictionPick) => Promise<void>;
}
```

- `match`: Entidad completa de partido del calendario de competición.
- `summary`: Resumen de estado de votación y porcentaje de la comunidad para ese partido.
- `pick`: Pronóstico previamente emitido por el usuario autenticado (si existe).
- `authenticated`: Indica si el visitante cuenta con una sesión válida de Discord.
- `save`: Función de guardado asíncrono inyectada por el hook `usePredictions`.

---

### 2.2 `PredictorRankingPanelProps`
Contrato de propiedades para el panel de clasificación de pronosticadores:

```typescript
interface PredictorRankingPanelProps {
  ranking: PredictorStanding[];
  season?: string | undefined;
  userId?: string | undefined;
}
```

- `ranking`: Lista ordenada de pronosticadores de la temporada.
- `season`: Nombre canónico de la temporada (ej. `"Temporada 2026"`).
- `userId`: Discord ID del usuario en sesión activa, utilizado para destacar su fila con la clase `.is-you`.

---

### 2.3 `UsePredictionsReturn` y Parámetros del Hook
Firma del hook headless `usePredictions` y su objeto de retorno:

```typescript
export function usePredictions(
  divisionId: string | undefined,
  userId: string | undefined,
  roundId?: string
): UsePredictionsReturn;

interface UsePredictionsReturn {
  data: PredictionsData | null;
  currentRound: string | null;
  picks: PredictionPick[];
  error: boolean;
  retry: () => void;
  save: (pick: PredictionPick) => Promise<void>;
}
```

#### Parámetros del Hook:
- `divisionId`: Identificador único de la división deportiva seleccionada, o `undefined` si aún no ha cargado.
- `userId`: Identificador de Discord del usuario autenticado, o `undefined` si navega como visitante anónimo.
- `roundId`: Identificador opcional de la jornada a consultar. Si se omite o es `undefined`, el hook solicita la jornada actual por defecto.

#### Propiedades de Retorno:
- `data`: Objeto `PredictionsData` devuelto por la API para la jornada consultada, o `null` si la respuesta no coincide con la clave activa o está cargando.
- `currentRound`: Identificador de la jornada en curso de la división activa (`string | null`), persistido en memoria durante la transición y consulta de jornadas anteriores.
- `picks`: Array de pronósticos registrados por el usuario para los partidos de la jornada visible.
- `error`: Booleano que indica error de red o fallo en la comunicación con el servidor.
- `retry`: Callback para forzar una sincronización manual inmediata.
- `save`: Función asíncrona optimista para emitir y guardar un pronóstico en un partido específico.

---

## 3. Reexportaciones y Tipos Importados de `@rcl/contracts`

Los componentes y hooks de predicciones consumen los tipos del contrato compartido:

| Tipo | Origen | Uso en Frontend |
|---|---|---|
| `PredictionPick` | `@rcl/contracts` | Pronóstico del usuario (`matchId`, `selectedTeamId`, `homeScore`, `awayScore`). Utilizado en el estado local del hook y en el formulario de `PredictionCard`. |
| `PredictionSummary` | `@rcl/contracts` | Metadatos de partido de la jornada (`open`, `closed`, `homePercent`, `votes`). Controla la visualización del termómetro comunitario. |
| `PredictorStanding` | `@rcl/contracts` | Fila individual de clasificación (`userId`, `name`, `position`, `correct`, `total`, `points`). Utilizado en `PredictorRankingPanel`. |
| `PredictionsData` | `@rcl/contracts` | Objeto raíz devuelto por la API con la semana deportiva (`week`), la jornada consultada (`round`), la jornada en curso (`currentRound`), el estado global de votación (`open`), los resúmenes de partidos y el ranking de la temporada. |
