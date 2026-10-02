# Portal Principal de Documentación Técnica — Rebel Crown Legacy (RCL-Next)

[⬅️ Volver al README Principal del Monorepo](../README.md)

---

## 1. Resumen Ejecutivo y Mapa de Navegación

Bienvenido al centro de documentación técnica del monorepo **RCL-Next**. Este portal constituye el índice maestro y mapa de navegación canónico de la arquitectura, servicios, clientes, datos e infraestructura de pruebas del proyecto.

Toda la documentación está organizada conforme al estándar modular del monorepo, garantizando que cada especificación cite `archivo:línea`, describa las excepciones de comportamiento y detalle de manera unívoca los mecanismos que operan en el código fuente vivo.

---

## 2. Árbol Visual de la Documentación (`tree`)

El siguiente diagrama representa la estructura física completa del ecosistema documental en `docs/`. Cada directorio cuenta con su propio índice local (`README.md`) y migas de pan (*breadcrumbs*) para navegación bidireccional:

```text
docs/
├── README.md                                    # Portal principal y sitemap maestro del monorepo
├── database/                                    # Capa de base de datos y arquitectura relacional
│   ├── README.md                                # Índice y principios de persistencia en PostgreSQL / Drizzle
│   ├── schema.md                                # Especificación de las 21 tablas relacionales y 6 enums
│   ├── constraints.md                           # Claves foráneas, índices parciales y triggers PL/pgSQL
│   ├── migrations.md                            # Ciclo de migraciones, advisory lock 72160419 y hashes SHA-256
│   ├── seed.md                                  # Siembra transaccional protegida, demo.sql con roles de Discord y showcase.sql
│   └── contracts.md                             # Mapeo y trazabilidad hacia tipos de @rcl/contracts
├── reference/                                   # Archivo arqueológico y comparativa histórica
│   ├── README.md                                # Análisis comparativo del esquema original vs Drizzle
│   └── 0000_initial_schema.original.sql         # SQL histórico de referencia (conservado intacto)
├── rofl/                                        # Pipeline de repeticiones y formato binario ROFL
│   ├── README.md                                # Índice general del motor de análisis de partidas LoL
│   ├── parser.md                                # CLI, códigos de salida y ordenación natural determinista
│   ├── binary-format.md                         # Cabecera b"RIOT", trailer seek inverso y statsJson
│   └── mapping.md                               # Normalización a 5 tablas y derivación de cuentas secundarias
├── api/                                         # Backend y servicios HTTP/WebSocket (Vertical Slices)
│   ├── README.md                                # Índice del backend Express, middlewares y arquitectura
│   ├── rofl-upload/                             # Rebanada: Subida y streaming WebSocket de repeticiones
│   │   ├── README.md                            # Resumen funcional de la ingesta de archivos .rofl y .zip
│   │   ├── routes.md                            # Gateway WS /ws/rofl-upload y control de backpressure
│   │   ├── processing.md                        # Descompresión, colas FIFO y spawn del parser Python
│   │   ├── persistence.md                       # Inserción atómica en match_games y tablas de jugador
│   │   ├── validation.md                        # Detección de anomalías de invocador y formato
│   │   └── contracts.md                         # DTOs tipados de eventos de subida y estado
│   ├── discord-bridge/                          # Rebanada: Pasarela y puente con bot comunitario Discord
│   │   ├── README.md                            # Resumen funcional del puente de sincronización
│   │   ├── routes.md                            # Endpoints REST y canal de señalización WebSocket
│   │   ├── processing.md                        # Conexión perezosa, reconexión y cola de eventos
│   │   ├── persistence.md                       # Persistencia de incidentes y estado de conexión
│   │   ├── validation.md                        # Validación de firmas de evento y tokens
│   │   └── contracts.md                         # Tipos de eventos bidireccionales del bridge
│   ├── suggestions/                             # Rebanada: Buzón de sugerencias comunitarias
│   │   ├── README.md                            # Resumen del buzón asíncrono HTTP 202 Accepted
│   │   ├── routes.md                            # POST /api/v1/suggestions y endpoints de consulta
│   │   ├── processing.md                        # Máquina de estados en memoria (TTL 2 horas)
│   │   ├── persistence.md                       # Incident logger a stderr y persistencia transitoria
│   │   ├── validation.md                        # Validación fail-fast de contenido y rate limits
│   │   └── contracts.md                         # Esquemas de sugerencias y respuestas de estado
│   ├── competition/                             # Rebanada: Motor deportivo, estadísticas y clasificaciones
│   │   ├── README.md                            # Resumen del cómputo de ligas, jornadas y clasificaciones
│   │   ├── routes.md                            # Rutas REST de temporadas, divisiones y clasificaciones
│   │   ├── processing.md                        # Clasificación de 4 niveles, escalado continuo de MVP (9 dimensiones) y slugs
│   │   ├── persistence.md                       # Consultas agregadas, rosters con cuenta principal y cuentas secundarias
│   │   ├── validation.md                        # Reglas de integridad deportiva y estados de serie
│   │   └── contracts.md                         # Tipos DTO de tablas de clasificación y estadísticas
│   ├── auth/                                    # Rebanada: Autenticación OAuth2 Discord y sesiones
│   │   ├── README.md                            # Resumen del flujo de autorización e identidad
│   │   ├── routes.md                            # /api/v1/auth/discord/login, callback, me y logout
│   │   ├── processing.md                        # Intercambio de code por access_token y sanitización
│   │   ├── persistence.md                       # Tabla auth_sessions y cookies HTTP-only firmadas
│   │   ├── validation.md                        # Verificación de firmas criptográficas de estado
│   │   └── contracts.md                         # Contratos de usuario autenticado y roles de sistema
│   ├── member-roles/                            # Rebanada: Control de acceso basado en roles (RBAC)
│   │   ├── README.md                            # Resumen de permisos (viewer, admin, owner)
│   │   ├── routes.md                            # Endpoints administrativos de auditoría y asignación
│   │   ├── processing.md                        # Reglas de elevación de privilegios y protección de owner
│   │   ├── persistence.md                       # Mutación de discord_users y registro en audit_logs
│   │   ├── validation.md                        # Guardas de rol y verificación de identidad propia
│   │   └── contracts.md                         # Tipos de roles de aplicación y logs de auditoría
│   ├── crud-operations/                         # Rebanada: Motor administrativo de operaciones CRUD
│   │   ├── README.md                            # Resumen del mantenimiento general de entidades
│   │   ├── routes.md                            # Endpoints dinámicos de gestión relacional y reordenación de mapas
│   │   ├── processing.md                        # Introspección de claves foráneas y protección de borrado
│   │   ├── persistence.md                       # Ejecución transaccional pesimista, reorderMaps y prevención de huérfanos
│   │   ├── validation.md                        # Esquemas de campos editables y comprobaciones previas
│   │   └── contracts.md                         # Definición de entidades administrables y metadatos
│   ├── database-transfer/                       # Rebanada: Exportación e importación de volcados
│   │   ├── README.md                            # Resumen de transferencias PostgreSQL vía comandos COPY
│   │   ├── routes.md                            # Endpoints de generación y subida de archivos .dump
│   │   ├── processing.md                        # Ordenación topológica de tablas y compresión gzip
│   │   ├── persistence.md                       # Restauración con vaciado en orden inverso de claves
│   │   ├── validation.md                        # Comprobación de cabecera mágica y verificación SHA-256
│   │   └── contracts.md                         # Esquemas de configuración de volcado y respuesta
│   ├── home-content/                            # Rebanada: Contenido editorial y equipo de la semana
│   │   ├── README.md                            # Resumen de publicaciones informativas y destacados
│   │   ├── routes.md                            # Endpoints REST de artículos y selección semanal
│   │   ├── processing.md                        # Lógica editorial y validación de quinteto por jornada
│   │   ├── persistence.md                       # Tablas editorial_articles y home_weekly_teams
│   │   ├── validation.md                        # Restricciones de 5 roles únicos en quinteto ideal
│   │   └── contracts.md                         # DTOs de artículos y composición del equipo ideal
│   ├── predictions/                             # Rebanada: Quinielas y predicciones comunitarias
│   │   ├── README.md                            # Resumen de pronósticos con límite horario Europe/Madrid
│   │   ├── routes.md                            # Endpoints de votación, consulta de resultados y rankings
│   │   ├── processing.md                        # Puntuación (1 pt ganador, 3 pts marcador exacto)
│   │   ├── persistence.md                       # Tabla predictions, bloqueo de inactivos y agregación de aciertos
│   │   ├── validation.md                        # Bloqueo temporal automático antes del primer mapa
│   │   └── contracts.md                         # Tipos de papeleta de predicción y tabla de líderes
│   └── team-logos/                              # Rebanada: Almacenamiento y catálogo de escudos de equipos
│       ├── README.md                            # Resumen funcional de gestión y servicio de imágenes
│       ├── routes.md                            # Endpoints REST de subida, borrado, catálogo y servicio público
│       ├── persistence.md                       # Almacén TeamLogosStore, escrituras atómicas wx y bytes mágicos
│       └── contracts.md                         # DTOs TeamLogoEntry, contratos de transporte y catálogo de errores
├── web/                                         # Frontend React 19 (Feature-Driven & Headless Hooks)
│   ├── README.md                                # Índice del cliente web, TailwindCSS y principios UI
│   ├── rofl-upload/                             # Feature: Interfaz de subida interactiva de repeticiones
│   │   ├── README.md                            # Resumen visual y funcional del panel de subida
│   │   ├── components.md                        # Dropzone, barras de progreso y visor de incidencias
│   │   ├── hooks.md                             # Headless hook useRoflUploadWs (streaming y estados)
│   │   ├── pages.md                             # Vista /admin/rofl/upload para administradores
│   │   └── types.md                             # Interfaces de eventos y estados de subida
│   ├── suggestions/                             # Feature: Buzón interactivo de propuestas
│   │   ├── README.md                            # Resumen del diálogo modal y feedback de usuario
│   │   ├── components.md                        # SuggestionModal, SuggestionForm y contadores
│   │   ├── hooks.md                             # Headless hook useSuggestion y reducer reactivo
│   │   ├── pages.md                             # Integración en cabecera y páginas públicas
│   │   └── types.md                             # Estados de la máquina de envío (queued -> confirmed)
│   ├── competition/                             # Feature: Vistas deportivas y estadísticas
│   │   ├── README.md                            # Resumen de componentes de liga y perfiles
│   │   ├── components.md                        # Tablas de clasificaciones, emparejamientos por carril y podio MVP
│   │   ├── hooks.md                             # Hooks de obtención y caché de datos de competición
│   │   ├── pages.md                             # Páginas públicas de liga y fichas de detalle (Match, Team, Player)
│   │   └── types.md                             # Tipos de presentación de clasificación y jugadores
│   ├── auth/                                    # Feature: Controles de identidad y sesión
│   │   ├── README.md                            # Resumen de autenticación en la interfaz de usuario
│   │   ├── components.md                        # Botón Login Discord, avatar y selector de logout
│   │   ├── hooks.md                             # Hook de contexto useAuth y guardas RequireAdmin
│   │   ├── pages.md                             # Manejador de callback de login y fallbacks
│   │   └── types.md                             # Interfaces de contexto de usuario autenticado
│   ├── member-roles/                            # Feature: Panel de gobernanza de roles
│   │   ├── README.md                            # Resumen del panel de gestión de miembros
│   │   ├── components.md                        # Tabla con búsqueda reactiva y modales de rol
│   │   ├── hooks.md                             # Hook de mutación y sondeo de roles de usuario
│   │   ├── pages.md                             # Vista /admin/member-roles
│   │   └── types.md                             # Tipos de edición de rol y filtros de auditoría
│   ├── crud-operations/                         # Feature: Consola de mantenimiento relacional
│   │   ├── README.md                            # Resumen de la interfaz CRUD administrativa
│   │   ├── components.md                        # Formularios tipados, MatchMapOrderEditor y borrado en cascada
│   │   ├── hooks.md                             # Hooks para introspección y ejecución transaccional
│   │   ├── pages.md                             # Vista /admin/crud con selector de entidades
│   │   └── types.md                             # Esquemas dinámicos de formularios y columnas
│   ├── database-transfer/                       # Feature: Centro de control de copias de seguridad
│   │   ├── README.md                            # Resumen del panel de exportación/importación
│   │   ├── components.md                        # Controles de volcado, zona de carga y alertas
│   │   ├── hooks.md                             # Hook para streaming de descarga y seguimiento
│   │   ├── pages.md                             # Vista /admin/database-transfer
│   │   └── types.md                             # Tipos de respuesta de estado y metadatos
│   ├── home-content/                            # Feature: Portal editorial y equipo destacado
│   │   ├── README.md                            # Resumen visual de la página de inicio
│   │   ├── components.md                        # Tarjetas de noticias, visor modal y quinteto ideal
│   │   ├── hooks.md                             # Hooks de lectura de artículos y equipo de la semana
│   │   ├── pages.md                             # Página principal / (Home)
│   │   └── types.md                             # Tipos visuales de noticias y roles de invocador
│   ├── predictions/                             # Feature: Centro de pronósticos deportivos
│   │   ├── README.md                            # Resumen de tarjetas de quiniela y ranking
│   │   ├── components.md                        # MatchCard de votación, selectores y tabla de puntos
│   │   ├── hooks.md                             # Hooks de comprobación horaria y envío de votos
│   │   ├── pages.md                             # Vista pública /predicciones
│   │   └── types.md                             # Modelos de tarjetas y marcadores de usuario
│   └── team-logos/                              # Feature: Gestión y visualización de logos de equipos
│       ├── README.md                            # Resumen visual y funcional del panel de logos
│       ├── components.md                        # TeamLogosPanel, useTeamLogos, degradación en TeamBadge y CSS
│       └── types.md                             # Interfaces Logo, UseTeamLogosReturn y cliente teamLogosApi
└── testing/                                     # Infraestructura, arneses y catálogo de pruebas
    ├── README.md                                # Estrategia general, niveles de prueba y PGlite
    ├── strategy.md                              # Filosofía de pruebas deterministas y pirámide de testing
    ├── environment-limits.md                    # Restricciones de runtime, maxWorkers: 4 y timeouts
    └── suites/                                  # Catálogo detallado de los 77 archivos de prueba
        ├── README.md                            # Censo general de suites (897 pruebas, 0 fantasma)
        ├── api.md                               # 15 suites de apps/api (128 pruebas unitarias)
        ├── web.md                               # 21 suites de apps/web (127 pruebas de componentes)
        ├── parser.md                            # 1 suite de apps/parser (11 pruebas de bajo nivel)
        └── integration.md                       # 25 suites en tests/integration/ (529 pruebas) y tests/unit/ (102 pruebas)
```

---

## 3. Catálogo Maestro de Secciones y Dominios

A continuación se indexan las 6 áreas primarias de documentación técnica con sus respectivos vínculos a los documentos atómicos especializados:

### 3.1 Base de Datos y Modelo Relacional (`docs/database/` y `docs/reference/`)

Gestiona el esquema de persistencia en PostgreSQL 16+ / PGlite 0.3+, modelado con Drizzle ORM en `packages/database/`:

- [docs/database/README.md](database/README.md): Introducción y principios de arquitectura relacional.
- [docs/database/schema.md](database/schema.md): Catálogo exhaustivo de las 21 tablas y 6 enums.
- [docs/database/constraints.md](database/constraints.md): Claves foráneas, checks, índices únicos parciales y triggers.
- [docs/database/migrations.md](database/migrations.md): Flujo de migraciones, advisory lock `72160419` y verificación de integridad.
- [docs/database/seed.md](database/seed.md): Estrategia de siembra transaccional protegida, demo.sql con roles de Discord, showcase.sql y verificación del invariante 5.
- [docs/database/contracts.md](database/contracts.md): Trazabilidad de entidades relacionales hacia `@rcl/contracts`.
- [docs/reference/README.md](reference/README.md): Comparativa técnica del esquema histórico vs el modelo Drizzle actual.
- [docs/reference/0000_initial_schema.original.sql](reference/0000_initial_schema.original.sql): Archivo SQL arqueológico conservado como referencia.

### 3.2 Motor de Repeticiones ROFL (`docs/rofl/`)

Ingesta de archivos binarios de repetición de League of Legends mediante lectura de metadatos de seek inverso en Python 3 (`apps/parser/roflParser.py`):

- [docs/rofl/README.md](rofl/README.md): Arquitectura del pipeline de extracción y tolerancia a fallos.
- [docs/rofl/parser.md](rofl/parser.md): Especificación de `roflParser.py`, interfaz CLI, códigos de salida 0 a 14 y ordenación natural determinista con swap atómico.
- [docs/rofl/binary-format.md](rofl/binary-format.md): Estructura binaria, cabecera `b"RIOT"` y empaquetado de metadatos.
- [docs/rofl/mapping.md](rofl/mapping.md): Normalización a 5 tablas Drizzle y derivación de cuentas secundarias hacia cuenta principal.

### 3.3 Servicios de Backend API (`docs/api/`)

Plataforma de servicios HTTP y WebSocket construida con Node.js 22 y Express, organizada en 11 rebanadas verticales (*Vertical Slices*):

- [docs/api/README.md](api/README.md): Índice del backend y principios de diseño modular.
- **Subida ROFL:** [rofl-upload/README.md](api/rofl-upload/README.md) | [routes.md](api/rofl-upload/routes.md) | [processing.md](api/rofl-upload/processing.md) | [persistence.md](api/rofl-upload/persistence.md) | [validation.md](api/rofl-upload/validation.md) | [contracts.md](api/rofl-upload/contracts.md)
- **Puente Discord:** [discord-bridge/README.md](api/discord-bridge/README.md) | [routes.md](api/discord-bridge/routes.md) | [processing.md](api/discord-bridge/processing.md) | [persistence.md](api/discord-bridge/persistence.md) | [validation.md](api/discord-bridge/validation.md) | [contracts.md](api/discord-bridge/contracts.md)
- **Sugerencias:** [suggestions/README.md](api/suggestions/README.md) | [routes.md](api/suggestions/routes.md) | [processing.md](api/suggestions/processing.md) | [persistence.md](api/suggestions/persistence.md) | [validation.md](api/suggestions/validation.md) | [contracts.md](api/suggestions/contracts.md)
- **Competición:** [competition/README.md](api/competition/README.md) | [routes.md](api/competition/routes.md) | [processing.md](api/competition/processing.md) | [persistence.md](api/competition/persistence.md) | [validation.md](api/competition/validation.md) | [contracts.md](api/competition/contracts.md)
- **Autenticación:** [auth/README.md](api/auth/README.md) | [routes.md](api/auth/routes.md) | [processing.md](api/auth/processing.md) | [persistence.md](api/auth/persistence.md) | [validation.md](api/auth/validation.md) | [contracts.md](api/auth/contracts.md)
- **Roles y Permisos:** [member-roles/README.md](api/member-roles/README.md) | [routes.md](api/member-roles/routes.md) | [processing.md](api/member-roles/processing.md) | [persistence.md](api/member-roles/persistence.md) | [validation.md](api/member-roles/validation.md) | [contracts.md](api/member-roles/contracts.md)
- **Operaciones CRUD:** [crud-operations/README.md](api/crud-operations/README.md) | [routes.md](api/crud-operations/routes.md) | [processing.md](api/crud-operations/processing.md) | [persistence.md](api/crud-operations/persistence.md) | [validation.md](api/crud-operations/validation.md) | [contracts.md](api/crud-operations/contracts.md)
- **Transferencia de BD:** [database-transfer/README.md](api/database-transfer/README.md) | [routes.md](api/database-transfer/routes.md) | [processing.md](api/database-transfer/processing.md) | [persistence.md](api/database-transfer/persistence.md) | [validation.md](api/database-transfer/validation.md) | [contracts.md](api/database-transfer/contracts.md)
- **Contenido Editorial:** [home-content/README.md](api/home-content/README.md) | [routes.md](api/home-content/routes.md) | [processing.md](api/home-content/processing.md) | [persistence.md](api/home-content/persistence.md) | [validation.md](api/home-content/validation.md) | [contracts.md](api/home-content/contracts.md)
- **Predicciones:** [predictions/README.md](api/predictions/README.md) | [routes.md](api/predictions/routes.md) | [processing.md](api/predictions/processing.md) | [persistence.md](api/predictions/persistence.md) | [validation.md](api/predictions/validation.md) | [contracts.md](api/predictions/contracts.md)
- **Logos de Equipos:** [team-logos/README.md](api/team-logos/README.md) | [routes.md](api/team-logos/routes.md) | [persistence.md](api/team-logos/persistence.md) | [contracts.md](api/team-logos/contracts.md)

### 3.4 Interfaz y Aplicación Web (`docs/web/`)

Cliente web interactivo en React 19 y Vite (`apps/web`), basado en componentes de presentación desacoplados (*Dumb UI*) y ganchos sin interfaz (*Headless Hooks*):

- [docs/web/README.md](web/README.md): Índice del frontend y estándar de diseño desacoplado.
- **Subida ROFL:** [rofl-upload/README.md](web/rofl-upload/README.md) | [components.md](web/rofl-upload/components.md) | [hooks.md](web/rofl-upload/hooks.md) | [pages.md](web/rofl-upload/pages.md) | [types.md](web/rofl-upload/types.md)
- **Sugerencias:** [suggestions/README.md](web/suggestions/README.md) | [components.md](web/suggestions/components.md) | [hooks.md](web/suggestions/hooks.md) | [pages.md](web/suggestions/pages.md) | [types.md](web/suggestions/types.md)
- **Competición:** [competition/README.md](web/competition/README.md) | [components.md](web/competition/components.md) | [hooks.md](web/competition/hooks.md) | [pages.md](web/competition/pages.md) | [types.md](web/competition/types.md)
- **Autenticación:** [auth/README.md](web/auth/README.md) | [components.md](web/auth/components.md) | [hooks.md](web/auth/hooks.md) | [pages.md](web/auth/pages.md) | [types.md](web/auth/types.md)
- **Roles y Permisos:** [member-roles/README.md](web/member-roles/README.md) | [components.md](web/member-roles/components.md) | [hooks.md](web/member-roles/hooks.md) | [pages.md](web/member-roles/pages.md) | [types.md](web/member-roles/types.md)
- **Operaciones CRUD:** [crud-operations/README.md](web/crud-operations/README.md) | [components.md](web/crud-operations/components.md) | [hooks.md](web/crud-operations/hooks.md) | [pages.md](web/crud-operations/pages.md) | [types.md](web/crud-operations/types.md)
- **Transferencia de BD:** [database-transfer/README.md](web/database-transfer/README.md) | [components.md](web/database-transfer/components.md) | [hooks.md](web/database-transfer/hooks.md) | [pages.md](web/database-transfer/pages.md) | [types.md](web/database-transfer/types.md)
- **Contenido Editorial:** [home-content/README.md](web/home-content/README.md) | [components.md](web/home-content/components.md) | [hooks.md](web/home-content/hooks.md) | [pages.md](web/home-content/pages.md) | [types.md](web/home-content/types.md)
- **Predicciones:** [predictions/README.md](web/predictions/README.md) | [components.md](web/predictions/components.md) | [hooks.md](web/predictions/hooks.md) | [pages.md](web/predictions/pages.md) | [types.md](web/predictions/types.md)
- **Logos de Equipos:** [team-logos/README.md](web/team-logos/README.md) | [components.md](web/team-logos/components.md) | [types.md](web/team-logos/types.md)

### 3.5 Infraestructura y Catálogo de Pruebas (`docs/testing/`)

Aseguramiento de la calidad sin dependencias externas, sustentado en PostgreSQL embebido (PGlite), Vitest y Python unittest:

- [docs/testing/README.md](testing/README.md): Visión general de testing y 5 niveles de pirámide de pruebas.
- [docs/testing/strategy.md](testing/strategy.md): Metodología de ejecución determinista y comandos unificados.
- [docs/testing/environment-limits.md](testing/environment-limits.md): Límites de concurrencia (`maxWorkers: 4`), timeouts y memoria.
- [docs/testing/suites/README.md](testing/suites/README.md): Índice y censo maestro de las 77 suites de prueba (897 pruebas, 0 fallos).
- [docs/testing/suites/api.md](testing/suites/api.md): 15 suites de pruebas unitarias del backend API.
- [docs/testing/suites/web.md](testing/suites/web.md): 21 suites de pruebas unitarias y de interfaz web.
- [docs/testing/suites/parser.md](testing/suites/parser.md): 1 suite de pruebas unitarias del extractor ROFL en Python.
- [docs/testing/suites/integration.md](testing/suites/integration.md): 25 suites de integración relacional y 15 de renderizado en aislamiento.

