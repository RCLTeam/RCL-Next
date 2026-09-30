# Módulo Web: Competition Feature (Frontend Golden Standard)

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Auth API ➡️](../../../docs/api/auth/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/web/src/features/competition/` implementa la interfaz visual y la orquestación del estado de cliente para las secciones de competición y liga de RCL-Next (clasificaciones, calendarios, equipos, jugadores, eliminatorias y estadísticas de campeones).

Su arquitectura respeta rigurosamente el **Golden Standard Modular** del monorepo:
1. **Componentes Puramente Presentacionales (*Dumb UI*):** Los 10 componentes visuales del directorio `components/` contienen estrictamente **cero llamadas a red** (`fetch`, `WebSocket`, `XMLHttpRequest` o `axios`). Reciben datos primitivos y *callbacks* exclusivamente vía *props*, garantizando accesibilidad, determinismo en el renderizado y facilidad de prueba unitaria.
2. **Lógica de Estado y Red Desacoplada (*Headless Hooks*):** La comunicación HTTP, el control de concurrencia y la sincronización residen en el directorio `hooks/` (`useCollection`, `useCompetitionSelection`, `useCompetition`, `useCompetitionDetail`).
3. **Cancelación Automática y Prevención de Carreras (*AbortController*):** Las peticiones de colección cancelan de forma transparente las consultas previas en vuelo cuando cambian los filtros de temporada o división (`useCollection.ts:13, 24`), y purgan inmediatamente el estado previo para evitar fugas visuales de datos desactualizados.
4. **Resiliencia Visual y Accesibilidad:** Implementación de vistas seguras contra *Cumulative Layout Shift* (CLS) mediante cajas delimitadoras fijas para emblemas de equipo, soporte de navegación completa por teclado en tablas desplazables (`tabIndex={0}`) y mecanismos accesibles para ocultar spoilers de resultados.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación (Dumb UI)** | [components.md](components.md) | Catálogo de los 10 componentes visuales puros (`StandingsTable`, `MatchCard`, `TeamCard`, `TeamBadge`, `DivisionCard`, `DivisionSwitch`, `PlayoffBracket`, `RoundFilter`, `CompetitionFilters`, `CompetitionDataState`), props, accesibilidad y cero red. |
| **Hooks Headless y Sincronización** | [hooks.md](hooks.md) | Gestión del ciclo de vida asíncrono con `useCollection`, cancelación vía `AbortController`, orquestación de recursos con `useCompetition`, selección jerárquica y mapeo de errores 404/422 a estados `missing`. |
| **Vistas Ensambladoras (Smart Pages)** | [pages.md](pages.md) | Integración de vistas en `apps/web/src/site/pages/` (`StandingsPage`, `CalendarPage`, `TeamsPage`, `PlayersPage`, `PlayoffsPage`, `ChampionsPage`, páginas de detalle), temporizadores en tiempo real y composición de hooks. |
| **Tipos y Contratos de Interfaz** | [types.md](types.md) | Modelos de estado de UI (`CollectionState`, `DetailState`), uniones discriminadas, opciones de ordenación de estadísticas (`PlayerSort`) y reexportación de contratos de competición. |

---

## 3. Garantías de Separación de Responsabilidades

- **Aislamiento Total de Transporte:** Ningún archivo dentro de `components/` importa librerías de cliente HTTP ni gestiona promesas de red.
- **Transiciones Limpias de Estado:** Durante una conmutación de división, `useCollection` retorna inmediatamente `{ status: 'loading', data: [] }`, garantizando que la interfaz jamás muestre datos de la división anterior mientras carga la nueva.
- **Protección Anti-Spoilers:** `MatchCard` ofrece un mecanismo basado en checkbox y CSS para permitir al usuario revelar u ocultar el marcador a discreción, preservando la experiencia deportiva de la comunidad.
