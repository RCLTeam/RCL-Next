# Estadísticas de jugadores y MVP

La página muestra primero el MVP de la jornada y después las fichas de todos los jugadores. El listado permite combinar búsqueda, posición y orden descendente por KDA, CS/min, participación, victorias, daño a campeones/min, visión o daño mitigado.

Los selectores compartidos de temporada y división delimitan el listado, las estadísticas y el MVP. La API `/divisions/:divisionId/players` incluye las cuentas inscritas en esa división y quienes hayan disputado sus mapas; cada división pertenece a una temporada, sin mezclar resultados históricos. El directorio global `/players` sigue disponible para resolver enlaces estables. Solo se agregan mapas con ganador de enfrentamientos finalizados; no cuentan encuentros programados, en directo, cancelados ni victorias administrativas sin estadísticas.

- KDA: suma de kills y asistencias dividida por muertes (mínimo 1).
- CS/min y daño a campeones/min: total dividido por minutos de los mapas con duración conocida.
- Participación: (kills + asistencias) / kills del equipo en los mapas disputados × 100. Con cero kills del equipo, vale 0.
- Victorias: porcentaje de mapas ganados.
- Visión y daño mitigado: media por mapa con ese dato disponible. Los datos desconocidos se muestran como «—» y se ordenan al final.

## MVP automático

Se obtiene un ganador por enfrentamiento, agregando todos sus mapas finalizados. No se guarda ni publica la puntuación: se recalcula desde los datos, de modo que corregir o volver a procesar una partida actualiza el resultado.

La fórmula suma contribuciones limitadas al rango 0–1, multiplicadas por estos pesos:

| Métrica | Peso | Referencia para obtener la contribución máxima |
| --- | ---: | --- |
| KDA | 25 | 6; divisor mínimo de una muerte por mapa para no favorecer series largas sin muertes |
| Participación | 25 | 80% |
| Daño a campeones/min | 15 | Según posición |
| CS/min | 10 | Según posición |
| Visión/min | 10 | Según posición |
| Daño mitigado/min | 10 | Según posición |
| Victorias | 5 | 100% de mapas ganados |

| Posición | CS/min | Daño/min | Visión/min | Mitigación/min |
| --- | ---: | ---: | ---: | ---: |
| Top | 7 | 600 | 1 | 900 |
| Jungla | 6 | 500 | 1,4 | 750 |
| Mid | 8 | 750 | 1 | 450 |
| ADC | 8 | 800 | 0,8 | 350 |
| Support | 1,5 | 300 | 2,5 | 600 |
| Sin posición conocida | 7 | 600 | 1,2 | 600 |

Son parámetros iniciales de diseño, ajustables en `player-statistics.ts`. Los datos ausentes no aportan puntos. La posición procede del mapa y, si falta, de la plantilla. En series se emplea la posición del primer mapa. Los empates se resuelven por mapas ganados y después por identificador estable del jugador.

La jornada actual se determina dentro de la temporada y división seleccionadas: la más reciente que haya comenzado o tenga resultados finalizados, respetando el identificador compuesto de jornada y división. Una jornada iniciada sin resultados muestra el estado pendiente, sin arrastrar al MVP anterior. Entre sus MVP de enfrentamiento se elige la mayor puntuación interna; las estadísticas visibles de la ficha corresponden a esa jornada. La API del enfrentamiento devuelve `mvpPlayerId` y las fichas incluyen `mvpMatchIds`, nunca la puntuación.
