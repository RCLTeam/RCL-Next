# Rutas y persistencia

[Volver al módulo](README.md)

Prefijo `/api/v1/crystal-ball/:season/:division`: nombre de temporada codificado y UUID de `seasons_divisions`. Se verifica que la división pertenece a esa temporada.

| Método y ruta | Comportamiento |
|---|---|
| `GET /` | Preguntas, candidatos, horarios, estado, resultados y ranking; nunca boletos ajenos. |
| `GET /mine` | Boleto del usuario autenticado. |
| `PUT /mine` | Reemplaza el boleto completo `{ questionId: [answerId] }` mientras está abierto. |
| `PUT /window` | Admin/owner: configura `{ opensAt, closesAt }` en ISO UTC. |
| `PUT /results` | Admin/owner: `{ answers, finalize }`. Publica resultados manuales; `finalize: true` solicita recálculo. |

Las respuestas no se cachean (`no-store`). Las escrituras requieren origen confiable y bloquean la campaña dentro de una transacción. Editor no tiene permiso administrativo sobre esta función.

El voto cierra al llegar al cierre configurado, al primer inicio de ronda o serie de playoffs, o al detectar una serie iniciada. Se consultan las rondas por separado: su `starts_at` cuenta aunque aún no tengan cruces. Una campaña cerrada no se puede reabrir. La existencia de resultados manuales o automáticos, un cálculo registrado o un administrador que ya haya resuelto también cierra la votación, incluso si un import o datos de prueba conservan fechas futuras. Esta regla se aplica tanto al estado público como al guardado de boletos y la configuración de horarios.

Los candidatos incluyen únicamente titulares y suplentes con cuenta principal. `DISTINCT ON` por usuario Discord y orden por ID de jugador garantizan una sola opción determinista aunque existan varias cuentas marcadas principales. Contexto y calendario se reutilizan en cada operación.

`crystal_ball_league_campaigns` guarda la ventana, resultados combinados, `automatic_results`, `calculated_at`, `finalized_at`, autor y actualización. `crystal_ball_league_entries` guarda el boleto con clave `(division_id, discord_user_id)`. Ambos tienen trigger `set_updated_at`; las FK usan nombres menores de 64 caracteres. No existen tablas de campaña global por temporada.

El ranking se deriva de boletos y resultados, sin contadores acumulativos. Los resultados pueden corregirse y recalcularse sin duplicar puntos.
