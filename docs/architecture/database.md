# Modelo de datos inicial

El diseño toma como referencia las funcionalidades actuales —clasificación, calendario, plantillas, estadísticas por mapa, Pick'Em y Discord— y separa identidad, competición y resultados.

```text
season → division → team
                  ↘ round → match → match_game → player_game_stat
player → team_membership ↗
discord_user → pickem_prediction → match
```

## Decisiones

- Los UUID evitan colisiones entre importaciones, bots y servicios.
- Una plantilla (`team_memberships`) tiene fechas: un jugador puede cambiar de equipo sin reescribir estadísticas históricas.
- Las estadísticas se vinculan a un mapa y registran también el equipo que representaba el jugador ese día.
- `matches` contiene la serie; `match_games`, cada mapa. Así se soportan Bo1, Bo3 y playoffs sin columnas especiales.
- La clasificación se calcula desde partidos finalizados; no se persisten victorias/derrotas duplicadas.
- Las acciones de administración se registrarán en `audit_logs`.

## Pendiente antes de importar datos

1. Confirmar reglas de desempate por división y fase.
2. Definir las fuentes válidas de resultados y estadísticas: administración, bot de Discord, parser ROFL o API de Riot.
3. Mapear las tablas MySQL antiguas y decidir qué temporadas se conservarán.
