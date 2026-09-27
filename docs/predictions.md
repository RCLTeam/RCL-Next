# Predicciones semanales

La semana corresponde al calendario de Europe/Madrid. La votación abre el lunes a las 00:00 y admite cambios hasta el martes a las 23:59:59.999. Desde el miércoles a las 00:00, el servidor rechaza escrituras y publica los porcentajes. Los cambios de horario de verano se calculan con la zona horaria de la liga.

Solo participan los encuentros fechados dentro de la semana actual. Un encuentro sin fecha, cancelado, iniciado o terminado no admite votos. Los porcentajes y el total de votos no se envían durante la votación. Sin votos se muestra un estado vacío, nunca porcentajes inventados.

Se puede guardar solo ganador o añadir un marcador válido para el BO de la serie. Se concede 1 punto por acertar solo el ganador y 3 puntos totales por acertar ganador y marcador. No hay bonus. Los resultados completados y las victorias por incomparecencia alimentan el ranking de temporada, que reúne ambas divisiones. Una corrección del resultado recalcula los puntos en la siguiente consulta.

El ranking muestra los cinco primeros y la posición del usuario si queda fuera de ellos. Los empates se ordenan por aciertos, nombre e identificador. Los votos requieren sesión de Discord y origen autorizado; la identidad no se recibe del cuerpo de la petición.

Se añadieron home_score y away_score, ambos nullable smallint, a predictions en el esquema inicial y su snapshot. La base local se actualizó conservando votos existentes (solo ganador), comprobando las columnas frente a una base limpia y reconciliando el hash de la única migración. No ejecutar esa reconciliación en producción.
