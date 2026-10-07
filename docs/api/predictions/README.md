# Módulo API: Match Predictions & Community Leaderboard

[⬅️ Volver a API](../README.md) | [Siguiente: API ROFL Upload ➡️](../rofl-upload/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/predictions/` implementa el sistema de quinielas y predicciones deportivas comunitarias de RCL-Next. Permite a los usuarios pronosticar el ganador y el marcador exacto de cada serie al mejor de 1, 3 o 5 partidas (Bo1, Bo3, Bo5), calculando dinámicamente la ventana de votación semanal, ocultando los votos de la comunidad hasta el cierre de la jornada para prevenir la colusión o el voto gregario, y generando la tabla de clasificación (*ranking*) acumulada de toda la temporada.

El subsistema se estructura en torno a los siguientes pilares arquitectónicos y de integridad:

1. **Ventana por partido (`Europe/Madrid`):** Abre el lunes a las 00:00 de la semana del encuentro y cierra exactamente una hora antes de su inicio. Solo admite votos en estado `scheduled`.
2. **Consulta por jornada:** `GET /divisions/:id` acepta `roundId` para consultar jornadas anteriores; por defecto muestra la jornada actual.
3. **Cierre y publicación independientes:** `closed` refleja el cierre del voto. Los porcentajes y el recuento solo se publican al finalizar el partido (`completed` o `forfeit`), nunca durante la hora previa ni en directo.
4. **Aplazamientos:** Retrasar un partido programado puede reabrir su votación en la semana actual; las tendencias permanecen ocultas hasta su finalización.
5. **Refutación Fáctica de Cuotas de Apuesta (Odds) y Multiplicadores:** En el sistema **no existen cuotas de apuestas, pagos, líneas de dinero ni multiplicadores de racha**. El sistema computa exclusivamente porcentajes enteros redondeados (`Math.round((100 * home) / votes)`). El baremo de puntuación otorga puntos planos deterministas: **3 puntos** por acertar ganador y tanteo exacto, **1 punto** por acertar ganador con tanteo incorrecto, y **0 puntos** si no se acierta el ganador (función `predictionPoints` en `prediction-policy.ts`).
6. **Agregación en SQL:** El método `overview` de `PredictionsRepository` calcula el ranking de la temporada completa con una consulta agrupada por usuario (una fila por pronosticador) y los recuentos de votos solo para los partidos mostrados con resultado publicado. Las filas transferidas por petición no dependen del número de votos de la temporada.
7. **Filtro Perimetral y Bloqueo Pesimista contra Equipos Inactivos / Fantasma (`INACTIVE_TEAMS`):** Exclusión en el calendario de jornadas (`overview`) mediante `gte(homeTeam.discordRoleId, 0n)` y `gte(awayTeam.discordRoleId, 0n)`, y bloqueo pesimista en `save()` con `SELECT FOR SHARE` sobre `teams`, rechazando pronósticos para equipos inactivos o fantasma con HTTP 409 `INACTIVE_TEAMS`.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Controladores** | [routes.md](routes.md) | Catálogo de los 3 endpoints HTTP montados bajo `/api/v1/predictions` (`GET /divisions/:id`, `GET /divisions/:id/mine`, `PUT /matches/:id`), cabeceras anti-caché, autenticación Discord y control de origen confiable. |
| **Lógica de Procesamiento** | [processing.md](processing.md) | Cálculo de la semana natural deportiva con `Intl.DateTimeFormat`, determinación de la jornada actual (`currentRoundId`), máquina de estados de la ventana de votación, baremo de puntos plano (3/1/0) y validación de marcadores Best-Of (Bo1, Bo3, Bo5). |
| **Persistencia y Base de Datos** | [persistence.md](persistence.md) | Operaciones con Drizzle ORM sobre la tabla `predictions`, filtrado perimetral de calendario (`discordRoleId >= 0n`), bloqueo compartido de participantes (`SELECT FOR SHARE`), restricción de clave foránea `ON DELETE RESTRICT` en equipos, clave única anti-duplicados `(discord_user_id, match_id)`, cobertura del trigger SQL `set_updated_at` y consultas agregadas del ranking de temporada y de los recuentos por partido. |
| **Validación y Errores** | [validation.md](validation.md) | Esquemas Zod estrictos, regla de equipos activos y código HTTP 409 `INACTIVE_TEAMS`, validación de pertenencia de equipos (`INVALID_TEAM`), límites de tanteo (`INVALID_SCORE`), conflicto de ventana cerrada (HTTP 409 `PREDICTIONS_CLOSED`) y códigos de estado. |
| **Contratos y DTOs** | [contracts.md](contracts.md) | Estructuras de datos TypeScript exportadas en `@rcl/contracts` (`PredictionPick`, `PredictionSummary`, `PredictorStanding`, `PredictionsData`) y criterios de ordenación del ranking. |

---

## 3. Garantías de Fiabilidad y Reglas de Integridad

- **Límite por partido:** No admite votos desde una hora antes del inicio ni cuando deja de estar `scheduled`.
- **Protección Frente al Borrado de Equipos:** La clave foránea `predictions_selected_team_id_fkey` vincula las predicciones a la tabla `teams` con cláusula `ON DELETE RESTRICT` (`packages/database/src/schema.ts`). Si un administrador intenta eliminar un equipo que posee al menos un voto registrado, el motor PostgreSQL bloquea la operación para preservar la integridad histórica de la clasificación.
- **Desempate Determinista de Clasificación:** El ranking de predictores ordena a los competidores por 4 criterios consecutivos: 1) Puntos totales DESC, 2) Aciertos totales DESC, 3) Nombre alfabético ASC, 4) Discord ID ASC (`predictions.repository.ts`, método `overview`).
