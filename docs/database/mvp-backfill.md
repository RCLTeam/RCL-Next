# Backfill de MVP históricos

El comando procesa enfrentamientos `completed` y rellena `matches.mvp_player_id` y `matches.mvp_score` cuando ambos campos están vacíos. Reutiliza los mismos datos y algoritmo que la subida ROFL: posición del replay por mapa, media ponderada por duración, participación mínima del 50% y candidatos del equipo vencedor.

## Ejecución

Ejecutar desde la raíz del repositorio, en el entorno que tenga acceso a la base de datos de la aplicación. Se utiliza `DATABASE_URL` del entorno o del `.env` raíz; no se pasan contraseñas como argumentos. El script no aplica migraciones automáticamente: la migración `0002_match_mvp` debe estar aplicada previamente mediante el procedimiento habitual (`pnpm db:migrate`).

```sh
# Vista previa: no modifica datos.
pnpm mvp:backfill

# Guardar los MVP pendientes y verificar cada escritura.
pnpm mvp:backfill --apply

# Verificar que no quedan asignaciones pendientes.
pnpm mvp:backfill --dry-run
```

El informe JSON indica la base utilizada, los totales y el resultado por enfrentamiento:

- `planned`: calculable, pendiente de guardar (solo simulación).
- `updated`: ambos campos guardados y releídos correctamente.
- `preserved`: ambos campos ya existían; no se recalculan ni sobrescriben.
- `unresolved`: requiere revisar datos; incluye el motivo y el identificador del enfrentamiento.
- `skipped`: el enfrentamiento desapareció o dejó de estar completado durante la ejecución.

Después de aplicar, la simulación debería mostrar `planned: 0`, `unresolved: 0` y `skipped: 0` para confirmar que todos los enfrentamientos examinados tienen MVP. Si hubo nuevas finalizaciones durante la ejecución, repetir el comando. Los MVP ya guardados se preservan aunque haya cambiado el algoritmo o las estadísticas; esta verificación comprueba cobertura, no reasigna ganadores históricos.

## Incidencias e idempotencia

Se señalan series sin mapas, mapas sin ganador o duración, marcadores incompatibles con los mapas, participantes sin estadísticas y ausencia de candidatos elegibles. Un galardón con solo uno de los campos informado tampoco se sobrescribe: puede reflejar la eliminación del jugador y necesita revisión.

Cada serie se procesa en su propia transacción y, al aplicar, se bloquea su fila con `FOR UPDATE`. Una interrupción conserva las series ya confirmadas y revierte la serie en curso; el comando puede repetirse sin duplicar ni reemplazar galardones. Un fallo de escritura detiene la ejecución. El resumen final solo se emite si termina el recorrido.

Códigos de salida: `0` ejecución terminada sin incidencias de datos, `2` hay registros `unresolved`, `1` fallo de configuración o ejecución. Una simulación con `planned > 0` puede terminar con código `0`: todavía no ha escrito nada.

Las pruebas de integración usan PostgreSQL embebido y cubren simulación, escritura verificada, repetición, concurrencia, datos incompletos y reversión ante errores. No equivalen a haber ejecutado el backfill sobre producción.
