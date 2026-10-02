# Rebel Crown Legacy (RCL-Next)

Plataforma integral de gestión de competición, telemetría deportiva y portal web para la liga Rebel Crown Legacy. Construida como un monorepo modular de alto rendimiento con TypeScript, React 19, Express, PostgreSQL con Drizzle ORM y un motor de extracción binaria de repeticiones en Python 3.

Para consultar la documentación técnica completa del monorepo, visita el [Portal Principal de Documentación Técnica](docs/README.md).

---

## 1. Visión General de la Arquitectura

El monorepo RCL-Next sigue un diseño estrictamente desacoplado organizado en cuatro capas fundamentales:

1. **Backend API (`apps/api`) — Rebanadas Verticales (*Vertical Slice Architecture*):**  
   Construido sobre Node.js 22 y Express. Cada funcionalidad de negocio (`apps/api/src/modules/`) es autónoma y encapsula sus propias rutas de transporte HTTP/WebSocket, lógica de procesamiento puro, acceso a datos transaccional con Drizzle ORM, esquemas de validación defensiva y contratos. La comunicación en tiempo real opera mediante pasarelas WebSocket (`ws`) con control de contrapresión (*backpressure*). Consulta la [documentación de la API](docs/api/README.md).

2. **Frontend Web (`apps/web`) — Diseño Guiado por Características (*Feature-Driven & Headless Hooks*):**  
   Aplicación cliente interactiva en React 19 y Vite con TailwindCSS. Desacopla radicalmente los componentes visuales puros y deterministas (*Dumb Components* en `components/`) de los efectos de red, sincronización y streaming de datos (*Headless Hooks* en `hooks/`). Las páginas (*Smart Pages* en `pages/`) actúan como orquestadores limpios de la vista. Consulta la [documentación del frontend](docs/web/README.md).

3. **Extractor Binario ROFL (`apps/parser`) — Lectura Inversa $O(1)$ en Python 3:**  
   Motor de bajo nivel (`roflParser.py`) que analiza archivos de repetición `.rofl` de League of Legends mediante un algoritmo de búsqueda inversa (*reverse seek*) que lee directamente los metadatos finales sin descomprimir paquetes pesados de red. Opera con cero dependencias externas de terceros y códigos de salida delimitados (0-14). Consulta la [documentación de ROFL](docs/rofl/README.md).

4. **Capa de Persistencia Relacional (`packages/database`) — PostgreSQL & PGlite:**  
   Modelo de 21 tablas relacionales y 6 enums tipados con Drizzle ORM (`packages/database/src/schema.ts`). Utiliza claves primarias naturales e inmutables, transacciones ACID con bloqueos consultivos de PostgreSQL (`pg_advisory_lock`), y disparadores PL/pgSQL transaccionales y diferidos (`complete_player_game`). Para pruebas automatizadas, utiliza PostgreSQL embebido en memoria (**PGlite 0.3+**) sin dependencias de red ni servicios externos. Consulta la [documentación de base de datos](docs/database/README.md).

---

## 2. Árbol Completo del Monorepo (`tree`)

```text
RCL-Next/
├── README.md                                    # Portal principal y guía de inicio del monorepo
├── package.json                                 # Configuración del workspace raíz (pnpm 11)
├── pnpm-workspace.yaml                          # Definición de paquetes y aplicaciones del monorepo
├── tsconfig.json                                # Configuración base estricta de TypeScript
├── biome.json                                   # Reglas de formateo, linting y organización de imports
├── vitest.config.ts                             # Configuración central de Vitest (maxWorkers: 4, timeout 30s)
├── drizzle.config.ts                            # Configuración de introspección y migraciones de Drizzle Kit
├── .env.example                                 # Plantilla canónica de variables de entorno del sistema
├── CONTRIBUTING.md                              # Guía de contribución y estándares de ingeniería
├── apps/                                        # Aplicaciones ejecutables del monorepo
│   ├── api/                                     # Backend Express y pasarelas WebSocket
│   │   ├── package.json                         # Dependencias y scripts de la API (@rcl/api)
│   │   ├── tsconfig.json                        # Configuración de compilación de desarrollo y tests
│   │   ├── tsconfig.build.json                  # Compilación limpia para producción (excluye tests)
│   │   └── src/                                 # Código fuente del backend
│   │       ├── app.ts                           # Fábrica de aplicación Express e inyección de dependencias
│   │       ├── server.ts                        # Punto de entrada, escucha HTTP/WS y apagado controlado
│   │       ├── config/                          # Carga y validación estricta de variables de entorno
│   │       ├── shared/                          # Errores de dominio, utilidades HTTP y middleware global
│   │       └── modules/                         # Rebanadas verticales de negocio
│   │           ├── auth/                        # Discord OAuth2, sesiones de base de datos y cookies
│   │           ├── competition/                 # Clasificaciones, desempates, estadísticas, visibilidad y algoritmo MVP
│   │           ├── crud-operations/             # Motor CRUD administrativo con detección de dependencias FK y reordenación de mapas
│   │           ├── database-transfer/           # Volcados y restauraciones PostgreSQL con comandos COPY
│   │           ├── discord-bridge/              # Cliente WebSocket hacia el bot de Discord con reintentos
│   │           ├── home-content/                # Publicaciones editoriales y equipo de la semana
│   │           ├── member-roles/                # Control de roles de usuario (viewer, admin, owner)
│   │           ├── predictions/                 # Quinielas semanales con bloqueo horario (Europe/Madrid)
│   │           ├── rofl-upload/                 # Subida por WebSocket, spooling en disco y persistencia
│   │           └── suggestions/                 # Buzón asíncrono con máquina de estados y log de incidentes
│   ├── web/                                     # Frontend cliente interactivo en React 19 + Vite
│   │   ├── package.json                         # Dependencias y scripts del frontend (@rcl/web)
│   │   ├── vite.config.ts                       # Configuración de Vite, plugins y alias de rutas
│   │   ├── index.html                           # Plantilla HTML raíz del portal web
│   │   ├── public/                              # Activos estáticos públicos (logos, escudos, marcas)
│   │   └── src/                                 # Código fuente del frontend
│   │       ├── App.tsx                          # Componente raíz y proveedor global de rutas
│   │       ├── features/                        # Características guiadas por dominio (Golden Standard)
│   │       │   ├── auth/                        # Botones de login Discord, avatar y barrera RequireAdmin
│   │       │   ├── competition/                 # Tablas de clasificación, calendarios, fichas de detalle y emparejamientos
│   │       │   ├── crud-operations/             # Formularios tipados, editor de mapas y modales de confirmación
│   │       │   ├── database-transfer/           # Panel de administración de copias de seguridad .dump
│   │       │   ├── discord-bridge/              # Hook de telemetría y salud del puente de Discord
│   │       │   ├── home-content/                # Tarjetas de noticias, visor modal y quinteto ideal
│   │       │   ├── member-roles/                # Tabla de miembros y selector de roles de aplicación
│   │       │   ├── predictions/                 # Tarjetas de quiniela, votación interactiva y rankings
│   │       │   ├── rofl-upload/                 # Dropzone de repeticiones, hook useRoflUploadWs y progreso
│   │       │   └── suggestions/                 # Modal de sugerencias, hook useSuggestion y reducer
│   │       ├── shared/                          # Componentes de presentación transversal, tokens y fuentes
│   │       └── site/                            # Shell del sitio, navegación principal, footer y rutas
│   └── parser/                                  # Motor de análisis binario en Python 3
│       ├── roflParser.py                        # CLI de extracción de metadatos LoL por seek inverso
│       ├── README.md                            # Guía técnica interna del módulo de extracción
│       ├── data/                                # Archivos de repetición sintéticos (.rofl) de prueba
│       ├── result/                              # Cargas útiles JSON esperadas para verificación
│       └── tests/                               # Batería de pruebas unitarias en Python unittest
│           └── test_roflParser.py               # Casos de prueba para cabecera b"RIOT" y cotas de memoria
├── packages/                                    # Paquetes compartidos del monorepo
│   ├── contracts/                               # Tipos TypeScript compartidos y contratos DTO
│   │   ├── package.json                         # Configuración del paquete @rcl/contracts
│   │   └── src/                                 # Definición de interfaces públicas, eventos y respuestas
│   └── database/                                # Esquema de persistencia, migraciones y datos de prueba
│       ├── package.json                         # Configuración del paquete @rcl/database
│       ├── drizzle/                             # Migraciones DDL SQL y journal versionado de Drizzle
│       │   └── 0000_initial_schema.sql          # Esquema relacional consolidado (21 tablas, 6 enums)
│       ├── seed/                                # Conjuntos de datos reproducibles
│       │   ├── demo.sql                         # Fixture mínimo para pruebas automatizadas
│       │   └── showcase.sql                     # Datos ricos de demostración con 240 estadísticas
│       └── src/                                 # Código de base de datos
│           ├── schema.ts                        # Definición tipada de tablas, enums, checks y relaciones
│           ├── connection.ts                    # Factoría de conexiones para PostgreSQL y PGlite
│           ├── migrate.ts                       # Ejecutor de migraciones con advisory lock 72160419
│           └── seed.ts                          # Sembrador transaccional protegido con lock 72160420
├── tests/                                       # Suites de pruebas transversales
│   ├── integration/                             # 25 suites de integración HTTP/WS sobre PGlite (529 tests)
│   ├── unit/                                    # 15 suites de renderizado aislado y helpers de shell (102 tests)
│   └── support/                                 # Adaptadores y utilidades de soporte para Vitest
└── docs/                                        # Documentación técnica canónica e hipergranular
    ├── README.md                                # Portal central de documentación y sitemap maestro
    ├── database/                                # Arquitectura relacional, tablas, constraints y migraciones
    ├── reference/                               # Referencia histórica y esquema original conservado
    ├── rofl/                                    # Formato binario, algoritmo del parser y mapeo de datos
    ├── api/                                     # Especificaciones atómicas de las 10 rebanadas de la API
    ├── web/                                     # Especificaciones atómicas de las 9 features del frontend
    └── testing/                                 # Estrategia de pruebas, límites de runtime y 77 suites
```

---

## 3. Puesta en Marcha y Guía Rápida

### Requisitos del Sistema
- **Node.js**: versión 22.0.0 o superior.
- **pnpm**: versión 11.0.0 o superior (`corepack enable pnpm`).
- **Python**: versión 3.10 o superior (solo requiere la librería estándar).
- **PostgreSQL**: versión 16 o superior (necesaria para ejecutar la aplicación en desarrollo; los tests automatizados no la requieren gracias a PGlite embebido).

### Pasos de Instalación y Arranque

1. **Clonar e instalar dependencias:**
   ```bash
   # En Windows PowerShell o terminal Linux:
   pnpm install --frozen-lockfile
   ```

2. **Configuración de Variables de Entorno:**
   ```bash
   # Crear .env local a partir de la plantilla:
   cp .env.example .env
   # O en PowerShell:
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```
   Configura `DATABASE_URL` con tu instancia de PostgreSQL de desarrollo. Para habilitar el inicio de sesión federado, define `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` y `DISCORD_REDIRECT_URI` (consulta la [guía de autenticación](docs/api/auth/README.md)). Si no se configuran credenciales de Discord, las rutas de autenticación responden 503 pero la API pública permanece plenamente operativa.

3. **Migraciones y Siembra de Datos:**
   ```bash
   pnpm db:migrate
   pnpm db:seed
   pnpm db:check
   ```
   *Nota sobre el seed:* La siembra requiere `ALLOW_DEMO_SEED=true` y rechaza `NODE_ENV=production`. Ejecuta `demo.sql` y `showcase.sql` en una sola transacción protegida por bloqueos consultivos. Crea una temporada de prueba, dos divisiones, cuatro equipos, 20 jugadores, 11 encuentros y 24 mapas con 240 registros de estadísticas completas.

4. **Arranque de Servidores de Desarrollo:**
   Ejecuta en terminales separadas:
   ```bash
   # Terminal 1 — Backend API (puerto 3001 por defecto):
   pnpm dev:api

   # Terminal 2 — Frontend React (puerto 5173 por defecto):
   pnpm dev:web
   ```
   Abre tu navegador en `http://localhost:5173`.

---

## 4. Consola de Administración (`/admin`)

El panel administrativo en `/admin` ofrece cuatro consolas operativas protegidas mediante la guarda `RequireAdmin` y verificación de roles (`admin` u `owner`):

1. **Subida de Repeticiones ROFL (`/admin/rofl/upload`):** Ingesta por lotes de partidas mediante streaming WebSocket con análisis sintáctico en caliente. Consulta [docs/api/rofl-upload/README.md](docs/api/rofl-upload/README.md) y [docs/web/rofl-upload/README.md](docs/web/rofl-upload/README.md).
2. **Operaciones CRUD (`/admin/crud`):** Mantenimiento de temporadas, divisiones, competiciones, equipos, invocadores y plantillas con validación transaccional y bloqueo preventivo ante dependencias relacionales activas. Consulta [docs/api/crud-operations/README.md](docs/api/crud-operations/README.md) y [docs/web/crud-operations/README.md](docs/web/crud-operations/README.md).
3. **Gestión de Roles (`/admin/member-roles`):** Asignación y revocación de permisos de aplicación (`viewer`, `admin`, `owner`) con trazabilidad en logs de auditoría. Consulta [docs/api/member-roles/README.md](docs/api/member-roles/README.md) y [docs/web/member-roles/README.md](docs/web/member-roles/README.md).
4. **Transferencia de Base de Datos (`/admin/database-transfer`):** Generación de copias de seguridad y restauración integral de datos de PostgreSQL mediante flujos `COPY` nativos. Consulta [docs/api/database-transfer/README.md](docs/api/database-transfer/README.md) y [docs/web/database-transfer/README.md](docs/web/database-transfer/README.md).

---

## 5. Pipeline de Verificación y Pruebas Automatizadas

El monorepo cuenta con una suite automatizada de **77 archivos de pruebas** y **897 pruebas verificadas** con una tasa de éxito del 100% y 0 suites fantasma:

```bash
# 1. Comprobación integral de tipos, estilo y suites de pruebas completas:
pnpm check

# 2. Certificación de esquema de base de datos e integridad Drizzle:
pnpm db:generate

# 3. Batería de pruebas unitarias del extractor binario ROFL en Python:
python3 -m unittest discover apps/parser/tests
```

### Detalle de los Comandos de Validación
- `pnpm check`: Ejecuta secuencialmente `pnpm typecheck` (compilación TypeScript en `packages/*` y verificación sin emisión en todas las aplicaciones), `biome check .` (linter y formateador) y `vitest run` (ejecución de las 76 suites TypeScript).
- `pnpm db:generate`: Ejecuta Drizzle Kit para inspeccionar `packages/database/src/schema.ts` y certificar que no existen discrepancias entre el modelo tipado y las migraciones generadas.
- `python3 -m unittest discover apps/parser/tests`: Ejecuta la batería de pruebas de bajo nivel del extractor Python, validando cotas de memoria, trailers little-endian y códigos de error (0-14).
- Las pruebas relacionales no requieren servicios externos de base de datos ni variables en `.env`, ejecutando sobre instancias efímeras de PostgreSQL en memoria mediante **PGlite**.

Para más detalles sobre la pirámide de pruebas, arneses y límites de concurrencia, consulta la [documentación de testing](docs/testing/README.md).

---

## 6. Recursos y Licencias

- **Fuentes Tipográficas:** La jerarquía visual utiliza *Manuka* para titulares y cifras, *PP Fraktion Sans* para controles y cuerpo, y *PP Fraktion Mono* para metadatos y estadísticas. Los archivos de fuentes se sirven localmente desde `apps/web/src/shared/assets/fonts/` junto a sus respectivas licencias. Vite las incluye en la compilación sin depender de CDNs externas.
- **Activos Deportivos:** Los logotipos oficiales de la liga se ubican en `apps/web/public/images/brand/` y los escudos de los equipos en `apps/web/public/images/teams_logo/`.
- **Esquema Histórico:** Se conserva el archivo arqueológico preliminar en `docs/reference/0000_initial_schema.original.sql` junto a su análisis comparativo en [docs/reference/README.md](docs/reference/README.md).
