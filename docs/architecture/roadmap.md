# Plan de refactorización y correspondencia funcional

## Entrega 1 — implementada

PostgreSQL/Drizzle coherentes con el SQL original, migraciones con snapshots, seed repetible, conexión y configuración centralizadas, API REST de consulta, separación controlador/servicio/repositorio y pruebas. Ver README para arranque y límites del entorno.

## Entrega 2 — API de negocio e Ingesta ROFL (Completada parcialmente)


- **Completado:** Consola de ingesta React 19 (`apps/web`), WebSocket Gateway con streaming directo a disco, control de contrapresión, y parseo dinámico de archivos ROFL (resiliencia de cabecera y exit codes POSIX).
- **Completado:** Mapeo de equipos y jugadores mediante `discord_user_id`, reglas de incomparecencia (5 jugadores), matching elástico de jornada semanal, unicidad por `external_game_id`, y persistencia atómica multi-tabla.
- Discord OAuth con state ligado al navegador, sesión segura y autorización contra el rol persistido; viewer/admin.

- **Implementado:** Discord OAuth con state ligado al navegador, sesión PostgreSQL y autorización contra el rol persistido; viewer/admin. Configuración y contrato en [autenticación](../authentication.md).

- **Implementado:** CRUD de temporadas, divisiones, competiciones, equipos, miembros Discord, jugadores, plantillas, jornadas y encuentros con auditoría y control de concurrencia. Admin ofrece ROFL Upload y CRUD Operations como dos subpáginas; las entidades se seleccionan dentro de CRUD Operations. Véase [administración](../administration.md).
- Perfiles y estadísticas agregadas a partir de info/stats/runas/build; filtro por temporada/división.
- **Implementado:** Administración de series y resultados manuales con transacciones y validación Bo1/Bo3/Bo5. Los resultados con mapas importados permanecen bajo el flujo ROFL.
- Pick'em: selección de ganador, cierre transaccional por jornada/partido, bonus validados y preguntas sin filtrar la respuesta correcta.
- Pruebas de autenticación, permisos, carreras al cerrar pronósticos e importaciones repetidas.

## Entrega 3 — React (Web Console Activa)

Aplicación `apps/web` desplegada con Vite + React 19, implementando la máquina de estados WebSocket, fragmentación Blob de 64 KB, dropzone, stepper y visor de telemetría en tiempo real. Futuras vistas de competición utilizarán React Router y TanStack Query. Estructura prevista: src/app, src/components/ui, src/features/{home,competition,teams,players,pickem,admin}, src/lib/api.

Referencia visual real: Maqueta/Rebel Crown Legacy_files/saved_resource.html y los assets contiguos. La página superior Rebel Crown Legacy.html es la envoltura guardada. Tokens detectados: amarillo #F4FF3A, púrpura #7B2CFF, tipografía de display Manuka Condensed/Bebas Neue y bloques oscuros. Implementar responsive, navegación, estados de carga/vacío/error y teclado.

## Mapa funcional

| Referencia antigua | Nuevo destino |
| --- | --- |
| index.ejs y vídeos destacados | Home; los vídeos son contenido, las noticias necesitan fuente editorial |
| clasificacion.ejs | Vista de clasificación; API de consulta ya disponible |
| calendario.ejs | Calendario por división/jornada/temporada; API de consulta disponible |
| equipos-list / equipo-detalle | Lista, ficha y plantilla histórica |
| jugadores / jugadorResumen | Ranking, ficha y estadísticas por mapa |
| campeones | Agregados de picks y winrate desde participaciones |
| playoffs | Vista de calendario por fase; cuadro competitivo posterior |
| pickem + bonus | Predicciones autenticadas |
| admin/match-stats y picks-equipos | Importación de un mapa completo y coherente |
| admin/info-tablas | Gestión específica de entidades; sin editor SQL genérico |
| auth/discord | Autenticación Discord segura |

La maqueta también muestra Fantasy, equipo de la semana y votación MVP. No son Pick'em ni existen sus entidades en el SQL: requieren decisiones funcionales y nuevas migraciones. Esta fase no inventa esa lógica ni la presenta como implementada. Los nombres Premier/Ascend caben en `divisions.name` sin convertirlos en enums rígidos.

## Pendiente de datos reales

No se ha encontrado un dump de la base MySQL antigua: hay controladores, consultas y vistas de referencia. No se han importado temporadas, cuentas o estadísticas reales. Para una migración histórica hará falta extraer la base de origen y definir correspondencias entre sus IDs y los UUID nuevos.
