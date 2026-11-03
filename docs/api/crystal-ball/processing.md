# Cálculo y resolución de resultados

[Volver al módulo](README.md)

Solo cuentan las rondas `stage = playoff` de la liga seleccionada. Antes de calcular, todas las series no canceladas deben estar terminadas o declaradas forfeit. La organización debe haber registrado el calendario completo, incluidas las finales. Los forfeits no aportan estadísticas de mapas.

El MVP usa `matches.mvp_player_id` de las series completadas; la pregunta se llama **Jugador con mas MVP de serie**. No usa el campo obsoleto `player_game_stats.is_mvp`. Si falta algún MVP, la pregunta queda pendiente.

Las cuentas secundarias de las estadísticas y de los MVP se normalizan a la cuenta principal mediante `players.discord_user_id`, con la misma elección determinista que los candidatos. Así se suman campeones y estadísticas al jugador votado.

El cálculo obtiene máximos individuales de K/D/A en un mapa, diversidad de campeones por jugador, picks, winrate (mínimo tres apariciones), medias K/D/A por aparición, posiciones diferentes, mayor diferencia final de oro, duración mínima y pentakills totales. Se devuelven todos los empates.

| Pregunta | Opciones |
|---|---|
| Diferencia final de oro | Menos de 5.000; 5.000–9.999; 10.000–14.999; 15.000–19.999; 20.000 o más. |
| Pentakills | 0, 1, 2, 3, 4, 5 o más. |
| Partida más corta | 0–19, 20–24, 25–29, 30–34, 35–39, 40–44 y 45+ minutos. |

No se reduce silenciosamente el mínimo de tres apariciones. Si no hay campeón elegible, las preguntas de winrate quedan pendientes. Si el número de mapas no coincide con el marcador, o faltan ganadores o estadísticas completas, no se publican resultados parciales de mapas. La telemetría opcional ausente deja pendiente la pregunta correspondiente. El MVP de serie puede calcularse aunque falten mapas.

Tras intentar el cálculo (`calculated_at`), administración puede resolver manualmente cualquier pregunta automática sin resultado, además de las preguntas editoriales: clasificados, campeón, finalista invicto, revelaciones, decepciones y mejor jugada. Los automáticos calculados tienen prioridad sobre el borrador manual.

El recálculo preserva los resultados manuales y fallbacks guardados, y sustituye los automáticos anteriores. Publicar manuales reemplaza el borrador manual completo. `finalized_at` solo se fija cuando todas las preguntas tienen respuesta y ya se ha intentado el cálculo. Si se retira un resultado, vuelve a quedar pendiente; el voto continúa cerrado.
