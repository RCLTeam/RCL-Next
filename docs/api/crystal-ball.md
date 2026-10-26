# Bola de cristal

Una campaña por liga y temporada; un boleto por usuario de Discord en cada liga. Cada división tiene cuatro clasificados para winner bracket y dos para loser bracket, sin duplicados. Cada equipo en su rama correcta da un punto; las otras 22 predicciones dan un punto cada una. El orden dentro de una rama no importa. Las estadísticas abarcan exclusivamente la liga seleccionada y únicamente jornadas `stage = playoff`.

## Operación

En `/admin/crystal-ball`, un administrador selecciona temporada y liga y configura apertura y cierre con fecha y hora independientes. La página pública `/bola-cristal` contiene el boleto por categorías y el ranking. El servidor cierra también al llegar al primer inicio de jornada/serie de playoffs o al detectar una serie iniciada. No permite reabrir una campaña cerrada. Los participantes pueden reemplazar su boleto completo mientras esté abierto; no se publican boletos ajenos.

Tras el cierre, el panel permite publicar o corregir resultados manuales, incluidos varios ganadores por empate. Los clasificados, campeones de división y finalista invicto son manuales: el calendario no codifica las ramas ni la final. Revelaciones, decepciones y mejor jugada también son manuales.

El botón de cálculo automático usa mapas y estadísticas importadas cuando todas las series registradas de playoffs han terminado. La organización debe completar el calendario, incluidas las finales, antes de calcular. Se excluyen series canceladas y mapas de forfeits. Se exige el número de mapas que indica el marcador. Un mapa sin ganador o sin diez estadísticas impide obtener resultados automáticos; la telemetría opcional incompleta deja pendiente solo su pregunta. Se puede recalcular tras corregir/importar datos, sin acumular puntos duplicados.

Se calculan MVP de mapa, máximos individuales de K/D/A en un mapa, diversidad de campeones por jugador, picks, winrate (mínimo tres apariciones), medias K/D/A por aparición, diversidad de posiciones, mayor diferencia **final** de oro entre equipos, duración mínima y total de pentakills. Todos los empates se aceptan; no se desempata arbitrariamente. Duraciones: menos de 20, 20–24, 25–29, 30–34, 35–39, 40–44 y 45+ minutos. Oro y pentakills son cantidades exactas.

## HTTP

Prefijo `/api/v1/crystal-ball/:season/:division` (nombre de temporada codificado en URL y UUID de seasons_divisions; se valida que pertenezcan a la misma temporada):

- `GET /`: preguntas, opciones, ventana, resultados y ranking públicos; sin votos ajenos.
- `GET /mine`: boleto del usuario autenticado.
- `PUT /mine`: objeto `{ questionId: [answerId] }`; guarda el boleto completo.
- `PUT /window`: administrador/owner, `{ opensAt, closesAt }` en ISO UTC.
- `PUT /results`: administrador/owner, `{ answers, finalize }`; reemplaza resultados manuales, y `finalize: true` recalcula los automáticos.

Todas las respuestas usan `no-store`; las escrituras exigen origen confiable. Las mutaciones bloquean la campaña en transacción. El ranking se deriva de respuestas y resultados; no almacena contadores que puedan duplicarse. La campaña conserva el último administrador que resolvió y la fecha de actualización.

## Despliegue y pruebas

Aplicar `0004_crystal_ball.sql` con `pnpm db:migrate` antes de iniciar la API. Se conserva el historial incremental existente (0000–0003), aunque la guía antigua aún menciona consolidar la base. No se modifica ninguna campaña o fecha al desplegar.

Pruebas: `crystal-ball-policy.test.ts`, `tests/integration/crystal-ball.test.ts` y `tests/integration/crystal-ball-router.test.ts`. Cubren reglas, empates, límites temporales, permisos, origen, persistencia en PGlite y correcciones idempotentes.

## Separación por liga

Aplicar también `0005_glamorous_surge.sql`. Las nuevas tablas `crystal_ball_league_campaigns` y `crystal_ball_league_entries` almacenan fechas, respuestas y resultados independientes. Cada boleto tiene 24 preguntas (28 puntos posibles: seis equipos y 22 predicciones). El ranking y el cierre automático solo usan la liga seleccionada.

Las tablas anteriores por temporada se conservan como histórico: sus predicciones globales no se convierten automáticamente en pronósticos de una liga, porque cambiaría su significado. Las nuevas campañas empiezan sin configurar. Se mantiene la secuencia incremental ya aplicada localmente para conservar el historial y los datos.
