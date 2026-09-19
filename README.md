# Rebel Crown Legacy

Base de la refactorización en TypeScript, Express y PostgreSQL con Drizzle. Incluye esquema, migraciones, datos de prueba, API de consulta y autenticación Discord con sesiones PostgreSQL. Incluye también el cliente React y la subida de repeticiones ROFL. Las siguientes etapas se detallan en [el roadmap](docs/architecture/roadmap.md).

## Inicio de sesión con Discord

Configura `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` y `DISCORD_REDIRECT_URI` en `.env`, aplica `pnpm db:migrate`, arranca `pnpm dev:api` y `pnpm dev:web` en terminales separadas y abre `http://localhost:5173`. La cabecera incluye **Entrar con Discord**, el usuario conectado y el cierre de sesión. Consulta [la guía de autenticación](docs/authentication.md) para registrar el callback y probar el acceso. Sin credenciales, la API pública sigue disponible y las rutas de autenticación devuelven 503.

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
apps/
  web/src/
    features/
      <funcionalidad>/pages/      Página y CSS propio
      <funcionalidad>/components/ Componentes exclusivos de la funcionalidad
      admin/pages/               Página de administración protegida
      rofl-upload/               Componentes, hooks y tipos de subida ROFL
      auth/                      Sesión compartida, controles y guarda de acceso
      competition/               Cliente API, tipos, hooks, filtros y vistas comunes
      site/                      Composición pública, navegación y estilos del sitio
    shared/
      components/                Layout reutilizable
      resources/                 Catálogo de imágenes y roles de jugador
      assets/                    Imágenes, fuentes y licencias
      styles/                    Base, tokens, fuentes y primitivas visuales
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

La estructura visual parte de `../Maqueta/`. Cada funcionalidad vive en `apps/web/src/features/<funcionalidad>/`: `pages/` contiene su página y CSS; `components/` sus componentes exclusivos. Los módulos de página son `home`, `leagues`, `calendar`, `standings`, `teams`, `players`, `champions`, `fantasy`, `predictions`, `crystal-ball`, `playoffs`, `admin` y `not-found`.

Las rutas públicas son `/`, `/ligas`, `/calendario`, `/clasificacion`, `/equipos`, `/jugadores`, `/campeones`, `/fantasy`, `/predicciones`, `/bola-cristal` y `/playoffs`. `/admin` y su alias `/admin/rofl/upload` aceptan barra final y están protegidos por `RequireAdmin`. Solo se monta el panel ROFL tras verificar una sesión con rol `admin`; carga, error, sesión anónima, otros roles y cierre de sesión bloquean el panel. Administración se enlaza desde los controles de cuenta del administrador y no aparece en el menú principal. El contrato actual solo admite `viewer` y `admin`; incorporar `organizer` exige ampliar contrato y esquema en un cambio de backend independiente.

`features/auth/` comparte una única sesión entre cabecera y guarda mediante `AuthProvider`. `features/competition/` reúne API, tipos, hooks y componentes de competición. `features/site/` compone el portal, la navegación y el marco visual. `shared/` contiene únicamente recursos y primitivas reutilizables. Los colores y fuentes están en `shared/styles/tokens.css` y `fonts.css`. Los estilos de navegación, cabecera, pie, filtros y tarjetas están junto a sus componentes; `site/site.css` conserva el orden de carga de los estilos compartidos. Cada página importa su propio CSS y sus ajustes responsive. La imagen `shared/assets/brand/rebellion.webp` conserva sus dimensiones de 1254 × 1254 y está comprimida con calidad 85 para la web.

El contenedor conserva el ancho completo y los mismos márgenes interiores. La selección de temporada y división se conserva al navegar entre páginas públicas. El hook de competición cancela solicitudes obsoletas y muestra estados de carga, error y vacío. Predicciones utiliza los partidos programados del calendario real; las funciones aún sin API muestran estados pendientes, sin inventar resultados o porcentajes.

El módulo `features/rofl-upload/` conserva componentes, hooks, tipos y pruebas del protocolo WebSocket. `features/admin/pages/admin.css` define el contenedor; `features/rofl-upload/components/rofl-upload.css` define la consola. El traslado no cambia contratos ni endpoints.

La paleta y la jerarquía tipográfica siguen `Maqueta/Guía de Marca RCL_files/saved_resource.html`: Manuka Condensed Black (900) para titulares; Manuka Bold (700) para subtítulos y cifras; PP Fraktion Sans Light/Bold (300/700) para cuerpo y controles; PP Fraktion Mono Regular/Bold (400/700) para metadatos y estadísticas. `tokens.css` centraliza todos los colores, incluidos victoria, derrota y avisos; los fondos y transparencias derivan de esos tokens. El texto principal usa Parchment White, nunca blanco puro.

Los siete archivos de fuente aportados en `Maqueta/` se sirven desde `shared/assets/fonts/manuka/` y `shared/assets/fonts/fraktion/`, con sus pesos declarados en `fonts.css` y sus avisos de licencia junto a los archivos. Vite incluye las fuentes en la compilación, sin depender de instalaciones locales ni de servicios externos. Bebas Neue, Inter y la fuente monoespaciada del sistema cubren los caracteres que falten en las fuentes proporcionadas. Los paquetes aportados indican `Personal Use Only` y Manuka se distribuye como `TestManuka`; para publicar con otra licencia hay que sustituirlos por los archivos autorizados conservando los nombres y pesos. Los fondos `/_blob/` siguen ausentes de la copia de la maqueta.

Al añadir una página, crea `features/<funcionalidad>/pages/`, importa su CSS y regístrala en `navigation.tsx` y `LeaguePortal.tsx` (o en `App.tsx` para vistas fuera del portal). Los componentes compartidos de un dominio viven en su funcionalidad; las primitivas transversales van en `shared/components/`. En producción, el servidor debe resolver las rutas de página a `index.html` y reenviar `/api` y `/ws/rofl-upload` a la API; Vite ya lo resuelve en desarrollo.

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

Las pruebas no requieren una base de datos externa ni variables en `.env`: ejecutan las migraciones reales y el seed sobre PostgreSQL embebido en memoria (`@electric-sql/pglite`), verificando las 19 tablas mediante Drizzle y recorriendo el flujo HTTP → controlador → servicio → repositorio → base de datos. PGlite proporciona aislamiento determinista e instantáneo para tests locales y CI sin dependencias de red. Para ejecutar la aplicación se utiliza una instancia PostgreSQL 17 configurada mediante DATABASE_URL. Las migraciones de base de datos se gestionan mediante `pnpm db:generate`, sobre el esquema inicial único `0000_initial_schema.sql`, que ya incluye las tablas de autenticación.

## Migraciones e historial

La migración original era SQL incompleto y no ejecutable. Se conserva íntegra como referencia y se ha reconstruido el baseline para **bases nuevas**. Por petición del usuario, antes de desplegar en producción se consolidaron las migraciones antiguas 0000/0001/0002 en una única `0000_initial_schema.sql`. Incluye visión, estadísticas ROFL, timestamps y validación de snapshots completos. Como la base todavía no está en producción, las tablas de autenticación también están integradas en ese esquema inicial: hay un único snapshot y una sola entrada en el journal. Si ya aplicaste el historial previo a la consolidación en desarrollo, utiliza otra base vacía o prepara una adaptación explícita; no se ha borrado ninguna base existente. Consulta `docs/architecture/rofl-mapping.md` para el mapeo completo de estadísticas.

Si tienes una base previa, no borres su volumen ni apliques este baseline manualmente. El runner rechaza esquemas sin historial o con hashes distintos. En ese caso hace falta una migración de adaptación basada en el esquema realmente desplegado. No se ha importado ni alterado ninguna base MySQL o PostgreSQL existente.
