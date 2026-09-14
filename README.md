# Rebel Crown Legacy — primera entrega: datos y backend

Base de la refactorización en TypeScript, Express y PostgreSQL con Drizzle. Esta entrega está centrada en el esquema, las migraciones, los datos de prueba y una API de consulta comprobable. Las siguientes etapas son autenticación Discord, administración, perfiles/estadísticas, Pick'em y React.

## Dónde está la base de datos

- SQL ejecutable: `packages/database/drizzle/0000_initial_schema.sql`.
- SQL original conservado: `docs/reference/0000_initial_schema.original.sql`.
- Modelo tipado: `packages/database/src/schema.ts`.
- Datos sintéticos: `packages/database/seed/demo.sql`.
- PostgreSQL local: servicio `postgres` de `compose.yaml`, puerto 5432, base `rcl`.
- Los registros se guardan en el volumen Docker `postgres_data`, no dentro del archivo SQL.

No se ha creado un servidor PostgreSQL en este equipo: Docker y psql no están disponibles en el entorno de ejecución. Las pruebas usan PostgreSQL embebido (PGlite), temporal y sin puerto TCP. No es una instancia de producción ni sustituye la comprobación del servidor de destino.

## Puesta en marcha (PowerShell, desde RCL Next)

Necesitas Node.js 22 o superior, pnpm 11 y Docker Desktop con contenedores Linux. También puedes usar una instalación propia de PostgreSQL 17 y cambiar DATABASE_URL.

```powershell
# Solo si todavía no existe .env; conserva tus credenciales actuales.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
pnpm install --frozen-lockfile
docker compose up -d --wait postgres
pnpm db:migrate
pnpm db:seed
pnpm db:check
pnpm dev:api
```

El seed requiere `ALLOW_DEMO_SEED=true` y rechaza `NODE_ENV=production`. Crea una temporada DEMO **inactiva**, dos divisiones vinculadas mediante seasons_divisions, cuatro equipos, veinte cuentas principales y sus miembros Discord, tres jornadas/series y un mapa con diez snapshots completos. Incluye 21 usuarios Discord ficticios (todos viewer) y un pronóstico; ya no hay tablas de bonus. Repetirlo no borra datos ni modifica filas existentes. Sus fechas de 2050 y nombres DEMO son deliberadamente ficticios.

## Cómo ver las tablas y los registros

Con PostgreSQL arrancado, puedes ejecutar `pnpm db:studio` y abrir la dirección que muestre Drizzle. Otra opción es Adminer:

```powershell
docker compose --profile tools up -d adminer
```

Abre http://localhost:8080 y selecciona PostgreSQL. Servidor: `postgres`; usuario: `rcl`; contraseña local: `rcl_dev_password`; base: `rcl`. Adminer es opcional. Para DBeaver/pgAdmin desde Windows, el servidor es `localhost` y el puerto `5432`.

## Comprobar la API

```powershell
Invoke-RestMethod http://localhost:3001/health/ready
Invoke-RestMethod http://localhost:3001/api/v1/seasons
$seasonName = [uri]::EscapeDataString('Temporada DEMO — datos ficticios')
Invoke-RestMethod "http://localhost:3001/api/v1/seasons/$seasonName/divisions"
Invoke-RestMethod http://localhost:3001/api/v1/divisions/20000000-0000-4000-8000-000000000001/standings
```

La clasificación DEMO muestra Lobos con una victoria y Cuervos con una derrota. El catálogo de temporadas incluye la DEMO aunque no esté activa. No hay fallback a datos simulados en la API: si PostgreSQL o las migraciones faltan, el arranque falla con una indicación concreta. Readiness devuelve 503 si se pierde la conexión.

## Estructura implementada

```text
apps/api/
  src/config/                    Carga y validación de entorno
  src/modules/competition/
    competition.repository.ts    Puerto de acceso a datos
    postgres-competition.repository.ts  Consultas Drizzle
    competition.service.ts       Reglas de clasificación y consultas
    competition.controller.ts    Validación de parámetros / respuesta HTTP
    competition.router.ts        Rutas REST
  src/shared/                    Errores centralizados
  src/app.ts                     Composición e inyección de dependencias
  src/server.ts                  Conexión, arranque y cierre controlado
packages/database/
  src/schema.ts                  Las 16 tablas del modelo
  src/index.ts                   Factoría Drizzle + pool PostgreSQL
  src/environment.ts             Ruta única de .env
  src/migrate.ts                 Runner con control de historial
  src/seed.ts                    Seed transaccional y repetible
  src/check.ts                   Conexión y listado de tablas
  drizzle/                       Migraciones SQL, journal y snapshots
  seed/demo.sql                  Datos de prueba
tests/
  unit/                          Pruebas unitarias (servicios, base de datos)
  integration/                   Pruebas de integración HTTP y de base de datos con PGlite
docs/
  architecture/database.md       Correcciones y decisiones del modelo
  architecture/roadmap.md         Mapa funcional y siguientes etapas
  api.md                         Contrato de los endpoints implementados
  verification.md                Resultados y censo de pruebas del monorepo
```

El frontend futuro irá en `apps/web`; aún no se ha creado. No se incorporan bots o servicios adicionales en esta fase.

## Verificación

```powershell
pnpm check
pnpm db:generate
```

El comando unificado `pnpm check` valida exhaustivamente la salud del proyecto ejecutando en pipeline:
1. `pnpm typecheck`: compila `@rcl/database` para emitir los tipos y artefactos en `dist`, comprueba los tipos de las suites de prueba en `tests/` mediante `tsc -p tsconfig.json` y valida con TypeScript estricto (`tsc --noEmit`) cada paquete del workspace.
2. `biome check .`: valida reglas de linter, formato y ordenación de imports en todo el repositorio.
3. `vitest run`: ejecuta la totalidad de las suites de prueba centralizadas en `tests/`.

Los paquetes que consumen código de `@rcl/database` (como `@rcl/api` y los tests de integración) acceden a las exportaciones tipadas a través de su carpeta `dist`. Por este motivo, se requiere compilar previamente la base de datos (`pnpm --filter @rcl/database build` o `pnpm build`) antes de ejecutar pruebas o arrancar los servicios en modo producción (`pnpm --filter @rcl/api start`).

Las pruebas no requieren una base de datos externa ni variables en `.env`: ejecutan las migraciones reales y el seed sobre PostgreSQL embebido en memoria (`@electric-sql/pglite`), verificando las 16 tablas mediante Drizzle y recorriendo el flujo HTTP → controlador → servicio → repositorio → base de datos. PGlite proporciona aislamiento determinista e instantáneo para tests locales y CI sin dependencias de red. Para entornos de desarrollo integrados y producción, se utiliza el servidor PostgreSQL 17 desplegado mediante Docker Compose (`compose.yaml`). Las migraciones de base de datos se gestionan mediante `pnpm db:generate`, sobre el baseline consolidado en `0000_initial_schema.sql`.

## Migraciones e historial

La migración original era SQL incompleto y no ejecutable. Se conserva íntegra como referencia y se ha reconstruido el baseline para **bases nuevas**. Por petición del usuario, antes de desplegar en producción se han consolidado las migraciones 0000/0001/0002 en una única `0000_initial_schema.sql`. Incluye visión, estadísticas ROFL, timestamps y validación de snapshots completos. Solo existe un snapshot y una entrada en el journal. Si ya aplicaste el historial anterior en desarrollo, utiliza otra base vacía o prepara una adaptación explícita; no se ha borrado ninguna base existente. Consulta `docs/architecture/rofl-mapping.md` para el mapeo completo de estadísticas.

Si tienes una base previa, no borres su volumen ni apliques este baseline manualmente. El runner rechaza esquemas sin historial o con hashes distintos. En ese caso hace falta una migración de adaptación basada en el esquema realmente desplegado. No se ha importado ni alterado ninguna base MySQL o PostgreSQL existente.
