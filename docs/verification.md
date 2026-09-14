# Verificación de la primera entrega

Fecha: 14 de septiembre de 2026.

| Comprobación | Resultado |
| --- | --- |
| pnpm build | Paquetes database y API compilados en `dist` |
| pnpm typecheck | TypeScript estricto validado en raíz (`tsc -p tsconfig.json`) y workspaces |
| biome check . | 0 errores de linter, formato y orden de imports en 33 archivos |
| vitest run / pnpm test | 6 suites de prueba y 11 tests principales ejecutados al 100% en verde |
| pnpm check | Pipeline unificado (`typecheck` + `biome check` + `vitest run`) exitoso |
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
5. **`tests/integration/database.test.ts`** (1 suite con 15 aserciones relacionales):
   - Idempotencia de migración reteniendo una única entrada en el journal.
   - Idempotencia de seed transaccional sin duplicación de filas.
   - Mapeo de las 16 tablas ORM a consultas SQL ejecutables.
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
6. **`tests/integration/apiIntegration.test.ts`** (1 test de flujo completo):
   - Recorrido extremo a extremo HTTP (Supertest) → controlador Express → servicio de competición → repositorio PostgreSQL real → base de datos embebida PGlite.

La suite completa se ejecuta de forma determinista y sin dependencias de red mediante PostgreSQL embebido en memoria (`PGlite`), validando esquemas reales y datos sintéticos en menos de dos segundos. No se ha validado todavía una conexión TCP con PostgreSQL 17 ni ejecutado Docker Compose, porque faltan esas herramientas en el entorno. No forman parte de esta entrega autenticación Discord, endpoints de escritura, importación ROFL, perfiles detallados, UI Pick'em ni frontend React (descritos en `architecture/roadmap.md`).
