# Verificación de la primera entrega

Fecha: 14 de septiembre de 2026.

| Comprobación | Resultado |
| --- | --- |
| pnpm build | Paquetes database y API compilados |
| pnpm typecheck | Código y pruebas con TypeScript estricto |
| pnpm test | 22 tests correctos: 12 de datos, 3 de métricas ROFL (incluidos tests contenedores), 6 HTTP/servicios y 1 integración completa |
| drizzle-kit generate sin cambios | No schema changes, nothing to migrate |
| drizzle-kit check | Historial de migraciones válido |
| git diff --check | Sin errores de whitespace |
| PostgreSQL TCP localhost:5432 | ECONNREFUSED: no hay servidor local arrancado |
| Docker / psql en este entorno | No disponibles |

Las pruebas de datos ejecutan la única migración SQL consolidada con Drizzle/PGlite y repiten migración y seed. Validan las 17 tablas a través del ORM, claves compartidas, rollback si faltan hijos, protección frente a borrado de un hijo, cascadas, ganador válido, valores negativos, temporada activa única y updated_at.

La integración HTTP usa el mismo controlador, servicio y PostgresCompetitionRepository de la aplicación; solo cambia el driver PostgreSQL por PGlite. No sustituye al repositorio por un mock. Las pruebas unitarias HTTP adicionales sí usan un repositorio controlado para provocar fallos y recursos inexistentes.

No se ha validado todavía una conexión TCP con PostgreSQL 17 ni ejecutado Docker Compose, porque faltan esas herramientas/servicios. El archivo .env local se creó con configuración de desarrollo y está ignorado por Git. No se ha creado una base remota, modificado datos reales ni publicado la API. Los diez jugadores del JSON ROFL de ejemplo se vuelcan únicamente en una base temporal de pruebas y se comparan las métricas, runas, objetos, hechizos, PUUID y posición al leerlos de vuelta.

No forman parte de esta entrega autenticación Discord, endpoints de escritura, importación ROFL, perfiles detallados, UI Pick'em ni frontend React. Están descritos en architecture/roadmap.md.
