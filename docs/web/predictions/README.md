# Módulo Web: Match Predictions & Community Leaderboard

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Testing Architecture ➡️](../../../docs/testing/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/web/src/features/predictions/` y sus vistas en `apps/web/src/site/pages/predictions/` implementan la experiencia de usuario completa para las quinielas y pronósticos comunitarios de RCL-Next. Permite a los aficionados votar por sus equipos favoritos en cada jornada deportiva, seleccionar resultados exactos en series al mejor de 1, 3 o 5 partidas, explorar tanto la jornada en curso como consultar el histórico de jornadas anteriores mediante un selector contextual integrado (`RoundFilter`), visualizar la tendencia porcentual de la comunidad mediante termómetros interactivos tras la finalización de cada partido, y competir en la tabla de clasificación de pronosticadores a lo largo de toda la temporada.

La implementación respeta estrictamente el **Golden Standard Modular** del monorepo (`reference/rofl-upload-architecture.md`):

1. **Aislamiento de Red en Componentes Visuales (*Dumb UI*):** Todos los componentes de presentación alojados en `apps/web/src/site/pages/predictions/` (`PredictionCard.tsx`, `PredictionRules.tsx`, `PredictorRankingPanel.tsx`) contienen estrictamente **0 llamadas a `fetch` y 0 llamadas a `WebSocket`**. Operan como vistas puras guiadas por propiedades y funciones de retrollamada (*callbacks*).
2. **Sincronización y Sondeo Periódico (*Headless Hook* `usePredictions`):** El hook desacoplado `usePredictions` (`apps/web/src/features/predictions/usePredictions.ts`) gestiona el ciclo de vida asíncrono, admitiendo la consulta de una jornada específica (`roundId`), persistiendo la jornada actual (`currentRound`), ejecutando peticiones paralelas mediante `Promise.all` con `AbortController`, realizando un refresco automático cada 15 segundos para mantener sincronizados el estado del reloj y los porcentajes, y aplicando actualizaciones optimistas inmediatas ante cada voto emitido.
3. **Selector de Jornadas con Restricción Temporal Estricta:** La vista integra `RoundFilter` respaldado por la función auxiliar pura `selectableRounds` (`apps/web/src/features/predictions/selectable-rounds.ts`), que restringe las opciones a la jornada actual y las anteriores ordenadas cronológicamente, garantizando que nunca se listen jornadas futuras.
4. **Ocultamiento Visual Anti-Spoilers de Porcentajes Comunitarios:** Los componentes gráficos respetan la política de confidencialidad de la liga: mientras el partido no haya finalizado (`summary.votes === null`), la barra de porcentaje comunitario no se renderiza, mostrando en su lugar el aviso accesible *"Los porcentajes se revelan al finalizar el partido"* (`PredictionCard.tsx`).
5. **Tabla de Clasificación Inclusiva y Accesible:** `PredictorRankingPanel.tsx` muestra el Top 5 de pronosticadores de la temporada. Si el usuario autenticado se encuentra clasificado por debajo del quinto puesto, la interfaz añade automáticamente una sexta fila destacada con la clase visual `.is-you` y la etiqueta accesible `"tú, <nombre>"` (`PredictorRankingPanel.tsx`).

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación (Dumb UI)** | [components.md](components.md) | Catálogo de componentes visuales puros (`PredictionCard`, `PredictionRules`, `PredictorRankingPanel`), props, callbacks, botones accesibles con `aria-pressed`, termómetro de porcentajes y cero red. |
| **Hooks Headless y Sincronización** | [hooks.md](hooks.md) | Hook `usePredictions`, soporte del parámetro opcional `roundId`, persistencia de `currentRound`, cliente de peticiones con `cache: 'no-store'`, generador `predictionsOverviewPath`, sondeo a 15 segundos, cancelación vía `AbortController`, mutación optimista local y recuperación ante errores. |
| **Vistas Ensambladoras (Smart Pages)** | [pages.md](pages.md) | Integración en `PredictionsPage`, selector de jornada actual y anteriores con `RoundFilter` y `selectableRounds`, conmutación keyed `${divisionId}:${roundId}`, carga de `'rounds'` en la ruta, insignia de estado de votación, banner de autenticación Discord y composición con `DataState`. |
| **Tipos y Contratos de Interfaz** | [types.md](types.md) | Contratos de interfaz de usuario (`PredictionCardProps`, `PredictorRankingPanelProps`, `UsePredictionsReturn` con `currentRound` y `roundId`), y reexportación de contratos de `@rcl/contracts` (`PredictionsData` con `round` y `currentRound`). |

---

## 3. Garantías de Separación de Responsabilidades

- **Cero Lógica de Red en Componentes Visuales:** `PredictionCard` no interactúa con la API; invoca la función asíncrona `save(pick)` suministrada por la Smart Page.
- **Actualización Optimista con Reversión:** Tras la confirmación de voto, el hook `usePredictions` actualiza inmediatamente la interfaz sin esperar la respuesta del servidor, incrementando la revisión de sondeo para consolidar la persistencia.
- **Protección Frente a Sesgo de Voto:** La interfaz de cliente jamás insinúa qué equipo es el favorito de la comunidad hasta que la votación ha sido formalmente clausurada por el backend.
- **Aislamiento Temporal de Jornadas:** El selector `RoundFilter` solo presenta la jornada actual y las anteriores de la división activa, impidiendo votos o visualizaciones en jornadas futuras no iniciadas.
