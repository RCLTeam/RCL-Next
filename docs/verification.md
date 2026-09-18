<<<<<<< Updated upstream
# Verificación de la primera entrega
=======
# Verificación

## Frontend Discord y entorno local — 17 de septiembre de 2026

- `pnpm typecheck`: correcto en raíz, API, base de datos y frontend.
- `pnpm test`: 93 pruebas en 17 archivos, todas correctas. Incluye 12 pruebas del cliente HTTP y los controles de sesión del frontend.
- `pnpm --filter @rcl/web build`: compilación de producción correcta.
- PostgreSQL 17.11 portable preparado en `.local/postgres`, con acceso solo desde 127.0.0.1. Esquema inicial aplicado a la base local `rcl`.
- Corregida la sintaxis de la clave foránea inline de `auth_sessions` y la selección del ejecutable Python en Windows para desbloquear las pruebas locales.
- API y frontend arrancados en los puertos 3001 y 5173. El navegador muestra el error de sesión y permite reintentar cuando Discord no está configurado.
- El consentimiento real de Discord queda pendiente de completar las credenciales locales. Las pruebas automatizadas del proveedor usan respuestas simuladas.

## Autenticación Discord — 16 de septiembre de 2026

- `pnpm typecheck`: correcto en raíz y workspaces.
- `biome check .`: correcto, 42 archivos comprobados.
- `pnpm test`: 37 pruebas en 10 archivos, todas correctas. Incluye 12 pruebas de integración de autenticación, 4 de configuración Discord y 4 de errores del proveedor.
- PostgreSQL embebido ejecuta el esquema inicial consolidado, comprueba las 19 tablas y valida el consumo único del estado OAuth, cookies, rotación/revocación/caducidad de sesiones, permisos y borrado en cascada. La autenticación se integró en ese esquema el 17 de septiembre de 2026, manteniendo una sola entrada en el journal.
- Las respuestas externas de Discord están simuladas. No se ha efectuado el consentimiento real ni aplicado la migración en una instancia PostgreSQL externa.
- Las pruebas de configuración utilizan `parseEnvironment` directamente para evitar depender del `.env` del equipo. No se añadieron dependencias.

## Primera entrega (registro histórico)
>>>>>>> Stashed changes

Fecha: 14 de septiembre de 2026.

| Comprobación | Resultado |
| --- | --- |
| pnpm build | Paquetes database y API compilados en `dist` |
| pnpm typecheck | TypeScript estricto validado en raíz (`tsc -p tsconfig.json`) y workspaces |
| biome check . | 0 errores de linter, formato y orden de imports en 33 archivos |
| vitest run / pnpm test | 13 suites de prueba y 61 tests principales ejecutados al 100% en verde |
| pnpm check | Pipeline unificado (`typecheck` + `biome check` + `vitest run`) exitoso |
| python3 -m unittest discover -s apps/parser/tests -p "test_*.py" | 11 tests ejecutados al 100% en verde (integridad binaria ROFL, cabecera y esquema) |
| pnpm db:generate | Generador de migraciones Drizzle sobre el baseline consolidado `0000_initial_schema.sql` |
| drizzle-kit check | Historial de migraciones válido |
| git diff --check | Sin errores de whitespace |
| PostgreSQL TCP localhost:5432 | ECONNREFUSED: no hay servidor local arrancado |
| Docker / psql en este entorno | No disponibles |

## Censo de suites de prueba unificadas (`tests/`)

Las suites de prueba se encuentran centralizadas bajo el directorio raíz `tests/` estructuradas por categoría:

1. **`tests/smoke.test.ts`** (1 test):
   - Verificación de ejecución del entorno de testing.
2. **`tests/unit/services/sampleService.test.ts`** (1 test):
   - Comprobación de servicios unitarios bajo patrón AAA.
3. **`tests/unit/services/api.test.ts`** (6 tests):
   - Respuesta de readiness ante caídas de base de datos (503 `DATABASE_UNAVAILABLE`).
   - Endpoints públicos de temporadas y divisiones.
   - Manejo estable de validación (422 `VALIDATION_ERROR`), recursos inexistentes (404) y rutas no soportadas.
   - Seguridad frente a fugas internas en JSON malformados o errores no esperados (500).
   - Cálculo de clasificación regular excluyendo playoffs y encuentros incompletos.
   - Filtrado de calendario por jornada y expansión de datos de equipos.
4. **`tests/unit/database/roflStats.test.ts`** (1 suite con subtests):
   - Inserción y normalización de los 10 participantes de una repetición ROFL sin pérdida de métricas (KDA, visión, objetivos, hechizos, objetos, runas y fragmentos).
   - Rechazo de estadísticas numéricas con valores negativos a nivel de constraint.
   - Retención de NULL en métricas ausentes y conservación de ceros explícitos.
5. **`tests/integration/database.test.ts`** (1 suite con 18 aserciones relacionales):
   - Idempotencia de migración reteniendo una única entrada en el journal.
   - Idempotencia de seed transaccional sin duplicación de filas.
   - Mapeo de las 17 tablas ORM a consultas SQL ejecutables.
   - Concordancia exacta de columnas, tipos, foreign keys, checks e índices frente a metadatos Drizzle.
   - Identidad compartida entre stats, runas y build vinculadas al padre `player_game_info`.
   - Propiedad de equipos por identidades Discord y soporte de múltiples cuentas de juego.
   - Restricciones sobre capitanes y unicidad de roles en plantillas.
   - Ámbito de jornadas por temporada/división y pronósticos por usuario Discord.
   - Validación y rechazo de estadísticas o visión negativas.
   - Rechazo de ganadores no válidos y participantes duplicados en partidas.
   - Transaccionalidad y rollback automático ante inserciones incompletas de hijos.
   - Integridad referencial ante borrado aislado de tablas hijas obligatorias.
   - Unicidad estricta de temporada activa.
   - Actualización desatendida del timestamp `updated_at`.
   - Cascada completa al eliminar la entidad principal del jugador en partida.
   - Registro de movimientos de plantilla (`roster_movements`): inserción de los 5 valores del enum `roster_movement_action` y rechazo de acciones inválidas.
   - Integridad referencial de movimientos: borrado en cascada por equipo y usuario sujeto, y preservación con `SET NULL` al eliminar el usuario autor (`actor_id`).
   - Disparo automático del trigger `set_updated_at` en modificaciones de `roster_movements`.
6. **`tests/integration/apiIntegration.test.ts`** (1 test de flujo completo):
   - Recorrido extremo a extremo HTTP (Supertest) → controlador Express → servicio de competición → repositorio PostgreSQL real → base de datos embebida PGlite.

## Censo de suites de prueba del parser ROFL (`apps/parser/`)

La suite de pruebas unitarias en Python se encuentra en `apps/parser/tests/test_roflParser.py` y se ejecuta con:

```bash
python3 -m unittest discover -s apps/parser/tests -p "test_*.py"
```

Comprende 7 casos de prueba ejecutados en milisegundos sin dependencias externas:
1. **`test_sample_rofl_exists`**: Verifica la presencia física del fixture de repetición real en `apps/parser/data/EUW1-7982902321.rofl`.
2. **`test_parse_real_rofl`**: Ejecuta la extracción de estadísticas sobre el fixture real hacia un archivo temporal, validando:
   - Versión de esquema (`version == 2`).
   - Número de participantes (`len(jugadores) == 10`).
   - Identificación del equipo ganador (`partida.equipo_ganador == 100`).
   - Presencia y tipos de campos esenciales de cada jugador (`nombre`, `tag`, `riot_id`, `kda`, `oro`, `cs`, `resultado` en `'Win'/'Lose'`, `runas` primarias/secundarias/fragmentos, inventario de exactamente 7 slots con `slot` e `id`).
   - Fidelidad al 100% frente al archivo de referencia `apps/parser/result/EUW1-7982902321_estadisticas.json`.
3. **`test_invalid_header_rejection`**: Comprueba que archivos que no comiencen por la firma mágica `b"RIOT"` sean rechazados inmediatamente con `ValueError("Cabecera ROFL no reconocida...")`.
4. **`test_file_too_small_rejection`**: Comprueba que archivos binarios menores a 8 bytes levanten `ValueError("Archivo ROFL demasiado pequeño")`.
5. **`test_invalid_metadata_length_rejection`**: Comprueba que trailers con longitud de metadatos no válida ($n \le 0$, $n > \text{MAX\_METADATA\_SIZE}$ o que excedan el tamaño físico del archivo) sean rechazados con `ValueError`.
6. **`test_cli_main_success_and_quiet`**: Verifica la invocación de la CLI mediante `main()` con los flags `-o` (ruta personalizada) y `-q` (modo silencioso), comprobando la creación del archivo de salida.
7. **`test_cli_main_file_not_found`**: Verifica que la CLI gestione rutas inexistentes devolviendo código de salida 1 y mensaje de error en `sys.stderr`.

La suite completa de pruebas de TypeScript se ejecuta de forma determinista y sin dependencias de red mediante PostgreSQL embebido en memoria (`PGlite`), validando esquemas reales y datos sintéticos en menos de dos segundos. No se ha validado todavía una conexión TCP con PostgreSQL 17 ni ejecutado Docker Compose, porque faltan esas herramientas en el entorno. No forman parte de esta entrega autenticación Discord, endpoints de escritura, importación ROFL, perfiles detallados, UI Pick'em ni frontend React (descritos en `architecture/roadmap.md`).

## Suites Adicionales (Ingesta y Frontend)
7. **`tests/e2e/roflWebSocketEndToEnd.test.ts`**: Flujo completo de ingesta streaming, parseo y base de datos PGlite.
8. **`tests/unit/services/roflUploadWebSocket.test.ts`**: Gestión de concurrencia y streaming de fragmentos.
9. **`tests/unit/database/roflUploadRepository.test.ts`**: Persistencia atómica de 5 tablas.
10. **`tests/unit/services/roflUploadValidation.test.ts`**: Detección de smurfs y equipos incompletos.
11. **`tests/unit/env.test.ts`**: Validación estricta de variables de entorno Zod.
12. **`apps/web/src/hooks/useRoflUploadWs.test.ts`**: Máquina de estados de conexión cliente React.
13. **`apps/web/src/App.test.tsx`**: Renderizado de terminal, stepper y telemetría.
