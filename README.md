# Rebel Crown Legacy

<<<<<<< Updated upstream
Base de la refactorización en TypeScript, Express y PostgreSQL con Drizzle. Esta entrega está centrada en el esquema, las migraciones, los datos de prueba y una API de consulta comprobable. Las siguientes etapas son autenticación Discord, administración, perfiles/estadísticas, Pick'em y React.
=======
Base de la refactorización en TypeScript, Express y PostgreSQL con Drizzle. Incluye esquema, migraciones, datos de prueba, API de consulta y autenticación Discord con sesiones PostgreSQL. Incluye también el cliente React y la subida de repeticiones ROFL. Las siguientes etapas se detallan en [el roadmap](docs/architecture/roadmap.md).

## Inicio de sesión con Discord

Configura `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` y `DISCORD_REDIRECT_URI` en `.env`, aplica `pnpm db:migrate`, arranca `pnpm dev:api` y `pnpm dev:web` en terminales separadas y abre `http://localhost:5173`. La cabecera incluye **Entrar con Discord**, el usuario conectado y el cierre de sesión. Consulta [la guía de autenticación](docs/authentication.md) para registrar el callback y probar el acceso. Sin credenciales, la API pública sigue disponible y las rutas de autenticación devuelven 503.
>>>>>>> Stashed changes

## Dónde está la base de datos

- SQL ejecutable: `packages/database/drizzle/0000_initial_schema.sql`.
- SQL original conservado: `docs/reference/0000_initial_schema.original.sql`.
- Modelo tipado: `packages/database/src/schema.ts`.
- Datos sintéticos: `packages/database/seed/demo.sql`.
- Conexión PostgreSQL: configurada mediante `DATABASE_URL` en `.env`.
- Los registros se guardan en la instancia PostgreSQL; el archivo SQL define la estructura.

Las pruebas automatizadas usan PostgreSQL embebido (PGlite), temporal y sin puerto TCP. Para ejecutar la aplicación necesitas una instancia PostgreSQL propia.

## Puesta en marcha (PowerShell, desde RCL Next)

Necesitas Node.js 22 o superior, pnpm 11 y PostgreSQL 17. Crea una base de desarrollo y configura su conexión en DATABASE_URL antes de ejecutar los comandos de base de datos.

```powershell
# Solo si todavía no existe .env; conserva tus credenciales actuales.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm db:check
pnpm dev:api
```

El seed requiere `ALLOW_DEMO_SEED=true` y rechaza `NODE_ENV=production`. Crea una temporada DEMO **inactiva**, dos divisiones vinculadas mediante seasons_divisions, cuatro equipos, veinte cuentas principales y sus miembros Discord, tres jornadas/series y un mapa con diez snapshots completos. Incluye 21 usuarios Discord ficticios (todos viewer) y un pronóstico; ya no hay tablas de bonus. Repetirlo no borra datos ni modifica filas existentes. Sus fechas de 2050 y nombres DEMO son deliberadamente ficticios.

## Cómo ver las tablas y los registros

Con PostgreSQL arrancado, ejecuta `pnpm db:studio` y abre la dirección que muestre Drizzle. También puedes conectar DBeaver o pgAdmin usando los datos de DATABASE_URL.

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
<<<<<<< Updated upstream
apps/web/
  src/                           Cliente React 19 (Vite)
  src/hooks/                     Máquina de estado WebSocket (`useRoflUploadWs.ts`)
  src/components/                Componentes UI (Dropzone, Stepper, Terminal)
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
apps/parser/
  roflParser.py                  Extractor CLI optimizado y API de repeticiones LoL (.rofl) con seek inverso
  tests/test_roflParser.py       Suite de pruebas unitarias automatizadas (unittest)
  data/                          Archivos .rofl de entrada
  result/                        Reportes generados en formato JSON
packages/database/
  src/schema.ts                  Las 17 tablas del modelo
  src/index.ts                   Factoría Drizzle + pool PostgreSQL
  src/environment.ts             Ruta única de .env
  src/migrate.ts                 Runner con control de historial
  src/seed.ts                    Seed transaccional y repetible
  src/check.ts                   Conexión y listado de tablas
  drizzle/                       Migraciones SQL, journal y snapshots
  seed/demo.sql                  Datos de prueba
=======
apps/
  web/src/
    features/auth/               Sesión Discord y controles de acceso
    features/rofl-upload/        Componentes, hooks, páginas y estado de subida
    App.tsx                      Composición de la interfaz
    *.test.tsx                   Pruebas junto al código que verifican
  api/src/
    config/                      Entorno y sus pruebas
    modules/auth/                OAuth Discord, sesiones y autorización
    modules/competition/         Rutas, controladores, servicios y repositorios
    modules/rofl-upload/          Procesamiento, validación, persistencia y WebSocket
    shared/                      Errores y utilidades HTTP
    app.ts                       Composición e inyección de dependencias
    server.ts                    Conexión, arranque y cierre controlado
  parser/
    roflParser.py                Extractor CLI de repeticiones LoL (.rofl)
    tests/                       Pruebas Python
    data/                        Ejemplo ROFL utilizado por las pruebas
    result/                      Ejemplo JSON utilizado por las pruebas
packages/
  contracts/src/
    auth.ts                      Tipo público de usuario autenticado
    rofl-upload.ts               Mensajes WebSocket, anomalías y resumen del lote
    index.ts                     Exportaciones públicas de @rcl/contracts
  database/
    src/                         Esquema Drizzle, conexión y comandos de base de datos
    drizzle/                     Migraciones SQL, journal y snapshots
    seed/demo.sql                Datos sintéticos de desarrollo y pruebas
>>>>>>> Stashed changes
tests/
  integration/                   Pruebas HTTP, WebSocket, parser y PGlite
  support/                       Adaptador node:test para Vitest
docs/
  architecture/                  Diseño, modelo de datos, parser y roadmap
  reference/                     SQL original conservado
  api.md                         Contrato de los endpoints
  authentication.md              Configuración de Discord
scripts/                         Herramientas de desarrollo local
```

Las pruebas unitarias y de módulo viven junto al código que verifican. Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para elegir dónde añadir archivos y qué convenciones seguir.

El frontend React 19 se encuentra en `apps/web`. Incluye el portal público y la consola de administración. No se incorporan bots o servicios adicionales en esta fase.

## Páginas del frontend

La estructura visual parte de `../Maqueta/`, con cada apartado en una página independiente: `/` (Inicio), `/ligas`, `/calendario`, `/clasificacion`, `/equipos`, `/jugadores`, `/fantasy` y `/playoffs`. La cabecera, el menú móvil, el acceso Discord y el pie son compartidos. La consola mantiene su URL `/admin/rofl/upload` y el protocolo WebSocket existente.

`features/site/pages/` contiene Inicio, Ligas, Jugadores y Fantasy; `features/competition/pages/` contiene Calendario, Clasificación, Equipos y Playoffs. `features/site/navigation.tsx` define las rutas y los enlaces internos; las páginas admiten navegación con historial y carga directa. La selección de temporada/división se conserva al navegar entre páginas públicas. `features/competition/` consulta los endpoints existentes de lectura, cancela solicitudes obsoletas y muestra estados de carga, error y vacío.

Jugadores, Fantasy, el quinteto de la jornada, editorial y coronas presentan su estructura visual con estados pendientes: todavía no existe una API para esas funciones. No se copian resultados ficticios de la maqueta. Los logos y las imágenes de marca disponibles se sirven desde `public/brand/`; las fuentes y fondos `/_blob/` ausentes de la copia se sustituyen por tipografías del sistema y fondos CSS.

En producción, el servidor del frontend debe resolver las rutas de página a `index.html` (fallback de SPA) y reenviar `/api` y `/ws/rofl-upload` a la API. Vite ya resuelve las páginas y los proxies durante el desarrollo. No se han cambiado contratos, migraciones ni endpoints del backend.

Las siete páginas interiores usan `features/site/components/PageLayout.tsx` para compartir cabecera, descripción, barra de controles y espaciado del contenido. `CompetitionFilters.tsx` mantiene los selectores de temporada y división en la misma posición. Los anchos, márgenes y alturas de controles se definen en las variables de `site.css`; los formatos específicos (tablas, equipos y cruces) se colocan dentro de esa estructura común.

## Verificación

```powershell
pnpm check
pnpm db:generate
python3 -m unittest discover -s apps/parser/tests -p "test_*.py"
```

El pipeline de validación comprueba la salud integral del proyecto:
1. `pnpm typecheck`: compila `@rcl/database` y `@rcl/contracts` para emitir los tipos y artefactos en `dist`, comprueba los tipos de las suites de prueba en `tests/` mediante `tsc -p tsconfig.json` y valida con TypeScript estricto (`tsc --noEmit`) cada paquete del workspace.
2. `biome check .`: valida reglas de linter, formato y ordenación de imports en todo el repositorio.
3. `vitest run`: ejecuta las suites colocadas junto al código en `apps/` y `packages/`, además de las de `tests/integration/`.
4. `python3 -m unittest discover -s apps/parser/tests -p "test_*.py"`: ejecuta la batería de pruebas unitarias del extractor ROFL en `apps/parser/tests/`, validando la lectura por seek inverso, comprobación de cabecera mágica `b"RIOT"`, cotas de metadatos y fidelidad del esquema JSON.

Los paquetes compartidos (`@rcl/database` y `@rcl/contracts`) exponen sus artefactos compilados desde `dist`. Ejecuta `pnpm build:packages` antes de invocar Vitest directamente, o `pnpm check` para compilar los paquetes y ejecutar toda la validación TypeScript. Para producción, `pnpm build` compila el workspace en orden de dependencias y `pnpm --filter @rcl/api start` arranca la API. Su compilación excluye los archivos de pruebas mediante `apps/api/tsconfig.build.json`.

<<<<<<< Updated upstream
Las pruebas no requieren una base de datos externa ni variables en `.env`: ejecutan las migraciones reales y el seed sobre PostgreSQL embebido en memoria (`@electric-sql/pglite`), verificando las 17 tablas mediante Drizzle y recorriendo el flujo HTTP → controlador → servicio → repositorio → base de datos. PGlite proporciona aislamiento determinista e instantáneo para tests locales y CI sin dependencias de red. Para entornos de desarrollo integrados y producción, se utiliza el servidor PostgreSQL 17 desplegado mediante Docker Compose (`compose.yaml`). Las migraciones de base de datos se gestionan mediante `pnpm db:generate`, sobre el baseline consolidado en `0000_initial_schema.sql`.
=======
Las pruebas no requieren una base de datos externa ni variables en `.env`: ejecutan las migraciones reales y el seed sobre PostgreSQL embebido en memoria (`@electric-sql/pglite`), verificando las 19 tablas mediante Drizzle y recorriendo el flujo HTTP → controlador → servicio → repositorio → base de datos. PGlite proporciona aislamiento determinista e instantáneo para tests locales y CI sin dependencias de red. Para ejecutar la aplicación se utiliza una instancia PostgreSQL 17 configurada mediante DATABASE_URL. Las migraciones de base de datos se gestionan mediante `pnpm db:generate`, sobre el esquema inicial único `0000_initial_schema.sql`, que ya incluye las tablas de autenticación.
>>>>>>> Stashed changes

## Migraciones e historial

La migración original era SQL incompleto y no ejecutable. Se conserva íntegra como referencia y se ha reconstruido el baseline para **bases nuevas**. Por petición del usuario, antes de desplegar en producción se han consolidado las migraciones 0000/0001/0002 en una única `0000_initial_schema.sql`. Incluye visión, estadísticas ROFL, timestamps y validación de snapshots completos. Solo existe un snapshot y una entrada en el journal. Si ya aplicaste el historial anterior en desarrollo, utiliza otra base vacía o prepara una adaptación explícita; no se ha borrado ninguna base existente. Consulta `docs/architecture/rofl-mapping.md` para el mapeo completo de estadísticas.

Si tienes una base previa, no borres su volumen ni apliques este baseline manualmente. El runner rechaza esquemas sin historial o con hashes distintos. En ese caso hace falta una migración de adaptación basada en el esquema realmente desplegado. No se ha importado ni alterado ninguna base MySQL o PostgreSQL existente.
