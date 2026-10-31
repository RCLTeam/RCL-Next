# Bola de cristal

[API](../README.md) · [Interfaz web](../../web/crystal-ball/README.md)

Una campaña independiente por liga y temporada, con un boleto por usuario de Discord. Contiene 24 preguntas y permite 28 puntos: cuatro equipos en winner bracket, dos en loser bracket y 22 predicciones individuales. Cada equipo acertado en su rama suma un punto; cada otra pregunta acertada suma uno. Se aceptan todos los ganadores empatados.

- [Rutas y persistencia](persistence.md): permisos, ventana de voto y transacciones.
- [Cálculo y resolución](processing.md): cuentas principales, MVP de serie, rangos y respuestas pendientes.
- [Migraciones](../../database/migrations.md): migración consolidada `0005_crystal_ball.sql` y bases de desarrollo anteriores.

El módulo se organiza en `controllers/` (HTTP), `persistence/` (consultas y transacciones), `processing/` (preguntas y cálculo) y `validation/` (respuestas, rangos y puntuación). Los contratos públicos están en `packages/contracts/src/crystal-ball.ts`.

Las pruebas de política y las suites `tests/integration/crystal-ball*.test.ts` cubren permisos, fechas, separación por liga, normalización de cuentas, empates, resultados incompletos y recálculo sin perder resultados manuales.
