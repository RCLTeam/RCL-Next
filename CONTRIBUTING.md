# Contribuir a RCL

## Convenciones

- El idioma del código, nombres y mensajes de error es inglés; la documentación orientada a la liga puede estar en español.
- TypeScript se mantiene en modo estricto. No se acepta `any`.
- Cada modificación de datos debe mantener la migración SQL y el esquema Drizzle sincronizados.
- No se modifican migraciones ya aplicadas en entornos compartidos; se añade una nueva.

## Base de datos

Las tablas `match_games` y `player_game_stats` representan hechos históricos. Los totales de clasificación, KDA, win rate y picks se derivarán desde ahí mediante consultas o vistas. Esto evita incoherencias de contadores que había en el sistema anterior.

Antes de unir una migración:

1. Arranca una base de datos limpia y aplica todas las migraciones.
2. Comprueba que las restricciones admiten los flujos reales.
3. Incluye índices para la consulta que justifica la tabla o el campo nuevo.
