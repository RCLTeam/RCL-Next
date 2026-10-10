# Módulo API: Competition Engine & League Administration

[⬅️ Volver a API](../README.md) | [Siguiente: API Auth ➡️](../auth/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/competition/` implementa el motor central de gestión de competiciones, ligas y administración deportiva de RCL-Next. Es responsable de la agregación de estadísticas de partidos al mejor de 3 (BO3), cálculo en memoria de clasificaciones de fase regular, valoración multidimensional del jugador más valioso (MVP) por serie y jornada, generación determinista de perfiles con slugs alfanuméricos y exposición pública de datos de temporadas, divisiones, equipos, jugadores, jornadas y calendarios.

El módulo opera bajo cinco pilares arquitectónicos y de ingeniería:
1. **Desacoplamiento y Agregación Pura en Memoria:** Los cómputos de clasificaciones (`calculateStandings`, `competition.service.ts:18-60`) y estadísticas agregadas de campeones (`calculateChampionStats`, `champion-stats.ts:1-32`) se ejecutan como funciones deterministas puras, desacopladas del almacenamiento relacional.
2. **Cómputo Multidimensional Continuo de MVP:** El algoritmo de puntuación individual evalúa 9 dimensiones con escalado logarítmico continuo (`1 + Math.log2(ratio) * 0.28`, `player-statistics.ts:108-172`) para evitar distorsiones por inflado de estadísticas en partidas de larga duración, seleccionando de forma determinista al MVP de cada serie.
3. **Hermetismo de Persistencia y Privacidad de Datos:** Las consultas SQL construidas con Drizzle ORM purgan activamente credenciales y metadatos internos (`puuid`, `discordUserId`, `createdAt`, `updatedAt`, `postgres-competition.repository.ts:85-102, 166-170`), impidiendo la fuga de identificadores de cuentas hacia los clientes.
4. **Validación Exhaustiva con Detección Temprana (*Fail-Fast*):** Todos los parámetros de consulta y ruta se analizan mediante esquemas Zod con modificador `.strict()`. Parámetros no reconocidos en query strings o formatos inválidos generan de forma inmediata un error HTTP 422 `VALIDATION_ERROR` (`competition.controller.ts:63-89`).
5. **Restricción de Acceso por Estado Deportivo:** El endpoint de detalle de partido (`GET /api/v1/matches/:matchId`) restringe deliberadamente el acceso a enfrentamientos en estado `'completed'` o `'forfeit'`, devolviendo HTTP 404 ante consultas sobre partidos programados o cancelados (`competition.service.ts:112-113`).
6. **Reglas de Visibilidad Deportiva y Deduplicación de Identidades:** Sentinels de rol de Discord (`isActiveTeam` con `discordRoleId >= 0n`, `isTeamVisibleInCalendar` con `discordRoleId >= -10n`, exclusión de fantasma `-9000n`), resolución de plantilla con deduplicación estricta de cuentas principales físicas (`selectDistinctOn([teamMemberships.discordUserId])` y filtro `players.isMain = true`), y resolución de cuentas secundarias (`linkedAccounts`) en el perfil de jugador.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Controladores** | [routes.md](routes.md) | Catálogo de los 12 endpoints HTTP montados bajo `/api/v1`, métodos, parámetros de ruta/query, semántica REST y matriz de códigos de estado (200, 404, 422, 500). |
| **Lógica de Procesamiento y Algoritmos** | [processing.md](processing.md) | Algoritmo de clasificación de 4 niveles (wins -> mapDifference -> losses -> localeCompare), motor de MVP unificado con escalado continuo a trozos de 9 dimensiones, resolución de estadísticas de temporada en traspasos, reglas de visibilidad deportiva (`team-visibility.ts`), fallbacks económicos, desempates deterministas, normalización de roles y slugs deterministas con SHA-256. |
| **Persistencia y Consultas Relacionales** | [persistence.md](persistence.md) | Implementación de `PostgresCompetitionRepository` sobre Drizzle ORM, proyección SQL, resolución de jornada activa, consulta de estadísticas de temporada del jugador (`playerSeasonGames`), detalle de equipo con cuentas principales y filtrado de MVPs, detalle de jugador con cuentas secundarias (`linkedAccounts`), deduplicación con `selectDistinctOn` y purga de campos sensibles. |
| **Validación y Manejo de Errores** | [validation.md](validation.md) | Esquemas Zod con `.strict()`, validación regex unicode para identificadores alfanuméricos, límites de rango `smallint` para jornadas y ciclo de error 422 / 404. |
| **Contratos y DTOs** | [contracts.md](contracts.md) | Estructuras de datos TypeScript exportadas en `@rcl/contracts` (`Standing`, `MatchDetail`, `TeamDetail`, `PlayerDetail`, `ChampionStats`, `Season`, `Division`, `Round`). |

---

## 3. Garantías de Fiabilidad y Reglas de Dominio

- **Ausencia de Dependencias Circulares:** Las funciones de cálculo matemático no importan componentes del repositorio ni de la capa HTTP Express.
- **Resolución Determinista de Perfiles:** Las referencias a equipos, jugadores o partidos en URLs admiten indistintamente UUIDs estándar o slugs normalizados sin ambigüedad mediante resolución inversa en memoria (`profile-slugs.ts:55-59`).
- **Criterios de Desempate en Clasificaciones:** El desempate en clasificaciones se rige estrictamente por victorias de serie, diferencia de mapas, derrotas y orden alfabético en locale `'es'`; no existen cálculos de Head-to-Head ni seguimiento de rachas (`streaks`) en el código vivo.
