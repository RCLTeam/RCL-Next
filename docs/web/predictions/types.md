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

### 2.3 `UsePredictionsReturn`
Firma del objeto de retorno producido por el hook `usePredictions`:

```typescript
interface UsePredictionsReturn {
  data: PredictionsData | null;
  picks: PredictionPick[];
  error: boolean;
  retry: () => void;
  save: (pick: PredictionPick) => Promise<void>;
}
```

---

## 3. Reexportaciones y Tipos Importados de `@rcl/contracts`

Los componentes y hooks de predicciones consumen los tipos del contrato compartido:

| Tipo | Origen | Uso en Frontend |
|---|---|---|
| `PredictionPick` | `@rcl/contracts` | Pronóstico del usuario (`matchId`, `selectedTeamId`, `homeScore`, `awayScore`). Utilizado en el estado local del hook y en el formulario de `PredictionCard`. |
| `PredictionSummary` | `@rcl/contracts` | Metadatos de partido de la semana (`open`, `closed`, `homePercent`, `votes`). Controla la visualización del termómetro comunitario. |
| `PredictorStanding` | `@rcl/contracts` | Fila individual de clasificación (`userId`, `name`, `position`, `correct`, `total`, `points`). Utilizado en `PredictorRankingPanel`. |
| `PredictionsData` | `@rcl/contracts` | Objeto raíz devuelto por la API con la semana deportiva, estado global, resúmenes y ranking. |
