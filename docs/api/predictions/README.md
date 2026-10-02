# Módulo API: Match Predictions & Community Leaderboard

[⬅️ Volver a API](../README.md) | [Siguiente: API ROFL Upload ➡️](../rofl-upload/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/predictions/` implementa el sistema de quinielas y predicciones deportivas comunitarias de RCL-Next. Permite a los usuarios pronosticar el ganador y el marcador exacto de cada serie al mejor de 1, 3 o 5 partidas (Bo1, Bo3, Bo5), calculando dinámicamente la ventana de votación semanal, ocultando los votos de la comunidad hasta el cierre de la jornada para prevenir la colusión o el voto gregario, y generando la tabla de clasificación (*ranking*) acumulada de toda la temporada.

El subsistema se estructura en torno a cinco pilares arquitectónicos y de integridad:

1. **Ventana Temporal Basada en Hora Peninsular Española (`Europe/Madrid`):** La política de calendario (`prediction-policy.ts:2-14`) calcula la semana deportiva tomando en consideración los cambios estacionales de horario (DST / horario de verano). La ventana de votación para una jornada abre el lunes a las 00:00:00 y expira el martes a las 23:59:59. Cualquier partido disputado en esa ventana queda además protegido por la condición `scheduledAt > now`.
2. **El Fenómeno de la Ventana Intermedia del Kickoff:** Si un partido oficial comienza el martes por la tarde antes de la medianoche, su estado de votación pasa a `open = false` (impidiendo nuevos votos o modificaciones sobre ese partido en curso), pero la propiedad `closed` permanece en `false` hasta que expire el martes completo a las 23:59:59 (`prediction-policy.ts:20-27`). Durante este intervalo, **las votaciones están bloqueadas pero los porcentajes comunitarios permanecen ocultos**, salvaguardando la confidencialidad de las predicciones durante la retransmisión en directo.
3. **Protección Anti-Colusión y Ocultamiento de Tendencias:** Mientras la ventana de votación no esté formalmente cerrada (`!window.closed`), el recuento total de votos (`votes`) y el porcentaje del equipo local (`homePercent`) se devuelven estrictamente como `null` (`predictions.repository.ts:64-72`). Ningún usuario puede inspeccionar la tendencia de la comunidad antes del cierre.
4. **Refutación Fáctica de Cuotas de Apuesta (Odds) y Multiplicadores:** En el sistema **no existen cuotas de apuestas, pagos, líneas de dinero ni multiplicadores de racha**. El sistema computa exclusivamente porcentajes enteros redondeados (`Math.round((100 * homeVotes) / totalVotes)`). El baremo de puntuación otorga puntos planos deterministas: **3 puntos** por acertar ganador y tanteo exacto, **1 punto** por acertar ganador con tanteo incorrecto, y **0 puntos** si no se acierta el ganador (`predictionPoints`, `prediction-policy.ts:30-32`).
5. **Advertencia de Escalabilidad (Agregación en Memoria):** El método `overview` de `PredictionsRepository` recupera de la base de datos la totalidad de predicciones registradas para todos los partidos y divisiones de la temporada completa (`predictions.repository.ts:22-28`), acumulando los puntos y calculando el ranking mediante estructuras `Map` en el proceso Node.js.
6. **Filtro Perimetral y Bloqueo Pesimista contra Equipos Inactivos / Fantasma (`INACTIVE_TEAMS`):** Exclusión en el calendario de jornadas (`overview`) mediante `gte(homeTeam.discordRoleId, 0n)` y `gte(awayTeam.discordRoleId, 0n)`, y bloqueo pesimista en `save()` con `SELECT FOR SHARE` sobre `teams`, rechazando pronósticos para equipos inactivos o fantasma con HTTP 409 `INACTIVE_TEAMS`.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Controladores** | [routes.md](routes.md) | Catálogo de los 3 endpoints HTTP montados bajo `/api/v1/predictions` (`GET /divisions/:id`, `GET /divisions/:id/mine`, `PUT /matches/:id`), cabeceras anti-caché, autenticación Discord y control de origen confiable. |
| **Lógica de Procesamiento** | [processing.md](processing.md) | Cálculo de la semana natural deportiva con `Intl.DateTimeFormat`, máquina de estados de la ventana de votación, baremo de puntos plano (3/1/0) y validación de marcadores Best-Of (Bo1, Bo3, Bo5). |
| **Persistencia y Base de Datos** | [persistence.md](persistence.md) | Operaciones con Drizzle ORM sobre la tabla `predictions`, filtrado perimetral de calendario (`discordRoleId >= 0n`), bloqueo compartido de participantes (`SELECT FOR SHARE`), restricción de clave foránea `ON DELETE RESTRICT` en equipos, clave única anti-duplicados `(discord_user_id, match_id)`, cobertura del trigger SQL `set_updated_at` y autopsia de la agregación de temporada en memoria. |
| **Validación y Errores** | [validation.md](validation.md) | Esquemas Zod estrictos, regla de equipos activos y código HTTP 409 `INACTIVE_TEAMS`, validación de pertenencia de equipos (`INVALID_TEAM`), límites de tanteo (`INVALID_SCORE`), conflicto de ventana cerrada (HTTP 409 `PREDICTIONS_CLOSED`) y códigos de estado. |
| **Contratos y DTOs** | [contracts.md](contracts.md) | Estructuras de datos TypeScript exportadas en `@rcl/contracts` (`PredictionPick`, `PredictionSummary`, `PredictorStanding`, `PredictionsData`) y criterios de ordenación del ranking. |

---

## 3. Garantías de Fiabilidad y Reglas de Integridad

- **Inmutabilidad Post-Kickoff:** Un partido programado no admite votos una vez alcanzada su hora de inicio (`scheduledAt <= now`), incluso si la jornada aún se encuentra dentro del plazo semanal de lunes o martes.
- **Protección Frente al Borrado de Equipos:** La clave foránea `predictions_selected_team_id_fkey` vincula las predicciones a la tabla `teams` con cláusula `ON DELETE RESTRICT` (`packages/database/src/schema.ts:624-627`). Si un administrador intenta eliminar un equipo que posee al menos un voto registrado, el motor PostgreSQL bloquea la operación para preservar la integridad histórica de la clasificación.
- **Desempate Determinista de Clasificación:** El ranking de predictores ordena a los competidores por 4 criterios consecutivos: 1) Puntos totales DESC, 2) Aciertos totales DESC, 3) Nombre alfabético ASC, 4) Discord ID ASC (`predictions.repository.ts:77-82`).
