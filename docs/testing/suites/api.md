# Catálogo de Suites de Pruebas: Backend API

[⬅️ Volver a Suites de Pruebas](README.md) | [Siguiente: Suites Frontend ➡️](web.md)

La suite `apps/api/src/modules/auth/discord-avatars.router.test.ts` añade 19 casos del proxy. Consulta su [cobertura y comandos de ejecución](../discord-avatars.md); el censo histórico siguiente precede a esta incorporación.

La suite `apps/api/src/modules/auth/session-cookie.test.ts` (12 casos) cubre el lector único de la cookie de sesión (`session-cookie.ts`): nombre según `secureCookies`, cookie entre otras, valor vacío y rechazo de duplicadas. `suggestions.router.test.ts` añade 7 casos parametrizados sobre la cookie que lee el router de sugerencias en HTTP y HTTPS. Tampoco figuran en el censo histórico.

---

## 1. Resumen Ejecutivo

El backend de RCL-Next (`apps/api`) cuenta con **15 suites de pruebas unitarias y de módulo co-ubicadas**, que ejecutan un total de **128 pruebas automáticas** a lo largo de **2.992 líneas de código**. Estas pruebas operan con ejecución rápida en memoria bajo Vitest, validando la lógica pura de negocio, parsing de configuraciones, sanitización de errores de clientes remotos y la orquestación asíncrona de servicios sin requerir base de datos activa.

---

## 2. Inventario de Suites de `apps/api`

| # | Archivo de Prueba | Pruebas | Líneas (LoC) | Módulo / Subsistema | Alcance y Aserciones Principales |
|---|---|---:|---:|---|---|
| 1 | `apps/api/src/config/auth-env.test.ts` | 4 | 51 | Configuración Auth | Validación de variables OAuth de Discord (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`), obligatoriedad de protocolo HTTPS en producción y parsing de valores por defecto. |
| 2 | `apps/api/src/config/env.test.ts` | 6 | 81 | Entorno Global | Función `parseEnvironment`, validación de formato de cadena de conexión `DATABASE_URL`, cotas numéricas del puerto HTTP `PORT` (1-65535) y entorno `NODE_ENV`. |
| 3 | `apps/api/src/config/load-env.test.ts` | 6 | 84 | Carga de Entorno | Precedencia en la resolución de archivos `.env` (`.env.local` sobreescribe `.env.production` y `.env`), inmutabilidad de variables preexistentes en `process.env`. |
| 4 | `apps/api/src/modules/auth/discord.client.test.ts` | 4 | 40 | Autenticación OAuth | Sanitización de errores remotos de la API de Discord mediante `it.each`: fallos de red (`network`), token inválido (`bad-token`), error de perfil (`profile-error`) y payload malformado (`bad-profile`). |
| 5 | `apps/api/src/modules/competition/champion-stats.test.ts` | 2 | 39 | Motor de Competición | Agregación de estadísticas de campeones sobre partidas completadas: cálculo de tasa de elección (*pick rate*), porcentaje de victorias (*win rate*) y ordenación descendente. |
| 6 | `apps/api/src/modules/competition/player-statistics.test.ts` | 8 | 202 | Estadísticas de Jugador | Algoritmos de cálculo de KDA ratio, súbditos por minuto (CS/min), participación en bajas (KP%), puntuación de visión, daño relativo y fórmula ponderada de MVP automático. |
| 7 | `apps/api/src/modules/database-transfer/postgres-copy-backup.test.ts` | 8 | 40 | Transferencia de Base de Datos | Parser de comandos binarios y texto de PostgreSQL `COPY`, descarte de cabeceras, escape de delimitadores tabulares, caracteres nulos (`\N`) y tablas opcionales. La suite contigua `postgres-backup-tools.test.ts` (1 prueba, 41 LoC) comprueba que `pg_dump` excluye los datos de `auth_sessions` y `oauth_states`. |
| 8 | `apps/api/src/modules/discord-bridge/discord-bridge.client.test.ts` | 21 | 727 | Puente con Bot Discord | Comunicación REST/WebSocket con el bot: autenticación con cabecera Bearer, tiempos de espera, reintentos exponenciales, serialización de payloads de sugerencias y recuperación ante fallos de conexión. |
| 9 | `apps/api/src/modules/predictions/prediction-policy.test.ts` | 3 | 44 | Políticas de Predicciones | Ventana de votación semanal en zona horaria Europe/Madrid (bloqueo automático al inicio de la jornada), reglas de asignación de puntos (1 punto por acertar ganador, 3 puntos por ganador y marcador exacto). |
| 10 | `apps/api/src/modules/rofl-upload/rofl-upload.test.ts` | 15 | 644 | Subida de Repeticiones | Validación de lotes ZIP, correspondencia de participantes con cuentas de invocador en base de datos, detección de anomalías multi-cuenta y avance correlativo de números de partida en series. |
| 11 | `apps/api/src/modules/suggestions/incident-logger.test.ts` | 6 | 69 | Logger de Incidentes | Formato estandarizado de incidentes en producción, generación de UUID v4 para trazabilidad, escritura en stream de errores (`stderr`) y anonimización de datos sensibles. |
| 12 | `apps/api/src/modules/suggestions/suggestion.store.test.ts` | 9 | 191 | Almacén de Sugerencias | Máquina de estados en memoria para propuestas de usuarios, poda automática por tiempo de vida (TTL de 2 horas), transiciones entre estados (`queued -> sending -> confirmed/failed`). |
| 13 | `apps/api/src/modules/suggestions/suggestions.integration.test.ts` | 6 | 169 | Integración Sugerencias | Coordinación entre el servicio de sugerencias, el almacén reactivo en memoria y el generador de logs de incidentes. |
| 14 | `apps/api/src/modules/suggestions/suggestions.router.test.ts` | 11 | 248 | Enrutador HTTP Sugerencias | Códigos de respuesta HTTP del endpoint Express: 202 Accepted ante encolado exitoso, 400 Bad Request por payload inválido o longitud excedida, 429 Too Many Requests por límite de tasa (*rate limit*). |
| 15 | `apps/api/src/modules/suggestions/suggestions.service.test.ts` | 20 | 376 | Lógica de Sugerencias | Reglas de negocio del buzón de sugerencias: deduplicación de propuestas idénticas en ventana corta, temporizador de reintento, despacho en segundo plano y manejo de desconexión del puente. |

---

## 3. Estrategia de Cobertura para Módulos sin Pruebas Unitarias Co-ubicadas

Conforme al diseño de la infraestructura de pruebas del monorepo, se señala explícitamente qué partes del código no cuentan con archivos de prueba directos en su carpeta local y por qué:

1. **Módulo `crud-operations` (`apps/api/src/modules/crud-operations/`):**
   - *Ausencia:* Cero archivos `*.test.ts` en el directorio.
   - *Dónde se prueba:* Se prueba de forma exhaustiva en `tests/integration/crud-operations.test.ts` (20 pruebas, 763 LoC).
   - *Justificación:* El motor de borrado relacional e introspección de claves foráneas no puede verificarse de forma significativa mediante mocks unitarios; requiere validar que PostgreSQL bloquee o propague borrados contra el motor relacional real en PGlite.

2. **Módulo `home-content` (`apps/api/src/modules/home-content/`):**
   - *Ausencia:* Cero archivos `*.test.ts` en el directorio.
   - *Dónde se prueba:* En `tests/integration/home-content.test.ts` (6 pruebas, 453 LoC).
   - *Justificación:* La persistencia de artículos y quintetos ideales requiere transacciones reales y verificación de ordenación cronológica en la base de datos.

3. **Módulo `member-roles` (`apps/api/src/modules/member-roles/`):**
   - *Ausencia:* Cero archivos `*.test.ts` en el directorio.
   - *Dónde se prueba:* En `tests/integration/member-roles.test.ts` (6 pruebas, 169 LoC).
   - *Justificación:* Valida las restricciones relacionales sobre los roles del sistema (`appRole`: `'viewer'`, `'admin'`, `'owner'`) en la tabla `discord_users`.
