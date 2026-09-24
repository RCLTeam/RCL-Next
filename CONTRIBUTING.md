# Contribuir a RCL

## Convenciones

- El idioma del código, nombres y mensajes de error es inglés; la documentación orientada a la liga puede estar en español.
- TypeScript se mantiene en modo estricto. No se acepta `any`.
- Cada modificación de datos debe mantener la migración SQL y el esquema Drizzle sincronizados.
- No se modifican migraciones ya aplicadas en entornos compartidos; se añade una nueva.

## Organización del código

- `apps/web/src/features/<funcionalidad>/`: componentes, hooks, acceso a la API y estado de cada funcionalidad. Los componentes React usan PascalCase y los hooks conservan el nombre `useNombre.ts`. Los demás archivos TypeScript usan kebab-case, con sufijos de responsabilidad como `.service.ts` o `.repository.ts`.
- `apps/api/src/modules/<funcionalidad>/`: lógica, rutas y persistencia de cada módulo. `config/` contiene la configuración y `shared/` solo las utilidades utilizadas por varios módulos.
- `apps/parser/`: extractor Python, sus pruebas y los ejemplos de entrada/salida utilizados como fixtures. Estos ejemplos se conservan porque las pruebas de integración dependen de ellos.
- `packages/contracts/`: tipos públicos de sesión y del protocolo WebSocket, importados con `import type` desde `@rcl/contracts`. No depende de React, Express ni la base de datos. Los tipos de estado de pantalla y los modelos internos del parser permanecen en su aplicación.
- `packages/database/`: esquema, conexión, migraciones y seed. Los consumidores acceden a sus exportaciones mediante `@rcl/database`.

Agrupa por funcionalidad antes de crear carpetas técnicas globales. Extrae elementos compartidos cuando tengan consumidores reales en varias funcionalidades.

### Localizar y editar el frontend

Agrupa por funcionalidad y mantén el código y los estilos junto a sus consumidores:

- **CSS mobile-first obligatorio:** las reglas base deben resolver pantallas pequeñas (desde 320 px). Amplía el diseño con `@media (min-width: ...)` según el espacio que necesite el contenido; no partas del escritorio para corregirlo con `max-width`. Usa rejillas y tamaños flexibles, evita anchos mínimos que desborden la página y conserva controles táctiles de al menos 44 px de alto. Las consultas de preferencias, como `prefers-reduced-motion`, son independientes de esta regla.
- Comprueba los cambios responsive en móvil, tablet y escritorio, también justo antes y después de cada breakpoint, con nombres largos y estados vacíos. El desplazamiento horizontal debe limitarse a contenido que realmente lo requiera (por ejemplo, una tabla), con una justificación explícita. Al modificar CSS anterior que use `max-width`, migra el bloque afectado a mobile-first sin cambiar bloques ajenos.
- En CSS, cada bloque corresponde a un componente o sección visual: reglas base, elementos internos, estados y ajustes responsive. Coloca las media queries junto al bloque al que afectan; evita añadir correcciones sueltas al final del archivo. Al consolidar reglas, conserva la especificidad y la precedencia de los breakpoints.
- Los estilos de cabecera, navegación y pie están en `site/layout/`; filtros, estados y tarjetas de competición en `features/competition/components/`. `site/layout/site.css` compone los estilos compartidos conservando su precedencia. Los estilos de cuenta están en `features/auth/components/auth.css`; cada página mantiene su CSS en `site/pages/<pagina>/` (incluidas `match-details`, `player-details` y `team-details`).
- Para cambiar el indicador de página seleccionada, edita `site/layout/site-navigation.css`: contiene `[aria-current='page']`, hover y onda de escritorio. `SiteNavigation`, dentro de `site/layout/SiteLayout.tsx`, asigna el atributo. Las rutas, títulos, pantallas y consultas de competición necesarias se definen en `site/routes.tsx`; `shared/navigation.ts` mantiene el contexto de navegación y el dibujo de la onda es `--squiggle` en `shared/styles/tokens.css`.
- La integración compartida con Riot está en `apps/web/src/shared/riot/`: `riot-assets.service.ts` ofrece el acceso común, `data-dragon.service.ts` gestiona las peticiones y la caché de Data Dragon, y `community-dragon.service.ts` resuelve los iconos de posiciones de CommunityDragon; `useGameCatalog` y `GameIcon` permiten consumirla desde cualquier página. Las páginas no deben construir URLs del CDN ni duplicar peticiones. Los futuros endpoints de Riot que requieran credenciales se integrarán en el backend, nunca exponiendo claves en el frontend.
- En los archivos React con varias responsabilidades visuales, usa funciones locales con nombres claros y mantén su estado y helpers junto a su consumidor. `SiteLayout.tsx` reúne la composición general, `SeasonHud`, `SiteHeader`, `SiteNavigation` y `SiteFooter` sin crear archivos adicionales.

## Alcance de los PR

Separa los cambios de layout frontend de extracciones de contratos, cambios de compilación del monorepo y renombrados de API. Si una vista necesita una modificación de backend, prepara primero un PR independiente y basa el frontend en él. El paquete `@rcl/contracts` y `build:packages` ya forman parte del historial actual y son dependencias de la autenticación y del protocolo ROFL; retirarlos requiere una separación de historial coordinada, no eliminar sus consumidores.

### Datos y estado del frontend

- `useCompetitionSelection` mantiene temporada, división y reintentos; `useCompetition` carga únicamente los recursos declarados por la ruta. El calendario también alimenta el indicador de directo de la cabecera. Las fichas y el listado de jugadores no cargan el contexto de competición.
- `useCollection` gestiona colecciones. Las fichas usan `useCompetitionDetail` y `competition-detail-api.ts` para compartir cancelación, reintentos, errores y respuestas de recurso no encontrado. Mantén las peticiones fuera de los componentes de página.
- Los componentes de competición se importan desde su archivo específico (`TeamBadge`, `MatchCard`, `DivisionSwitch`, `CompetitionDataState`). El reducer de subida ROFL está en `features/rofl-upload/state/upload-reducer.ts`; el hook mantiene el ciclo de vida WebSocket.

## Organización de las pruebas

- Las pruebas de una función, componente o módulo se colocan junto al código, con el sufijo `.test.ts` o `.test.tsx`.
- `tests/integration/` contiene recorridos HTTP/WebSocket y pruebas con PGlite que conectan varias capas o aplicaciones.
- `tests/support/` contiene utilidades de infraestructura de pruebas, como el adaptador de `node:test` a Vitest.
- Las pruebas Python permanecen en `apps/parser/tests/`.

Vitest descubre pruebas en `apps/`, `packages/` y `tests/`. TypeScript también comprueba las pruebas colocadas junto al código, pero la compilación de la API usa `tsconfig.build.json` para excluirlas de producción.

Ejecuta `pnpm check` para comprobar tipos, formato y pruebas TypeScript; `pnpm build` verifica la compilación de producción. Ejecuta por separado `python -m unittest discover -s apps/parser/tests -p "test_*.py"` para el parser (o `python3` si ese es el ejecutable de tu entorno).

Antes de ejecutar Vitest directamente en un checkout nuevo, ejecuta `pnpm build:packages` para generar las exportaciones de los paquetes compartidos. Los comandos `dev:api`, `dev:web` y `typecheck` compilan sus paquetes necesarios automáticamente.

## Base de datos

El proyecto requiere una instancia PostgreSQL accesible mediante `DATABASE_URL`. Configura la conexión usando `.env.example` como referencia y ejecuta `pnpm db:migrate` y `pnpm db:check`. El seed opcional se ejecuta con `pnpm db:seed` y requiere `ALLOW_DEMO_SEED=true` en un entorno de desarrollo o pruebas.

Las tablas `match_games` y `player_game_stats` representan hechos históricos. Los totales de clasificación, KDA, win rate y picks se derivarán desde ahí mediante consultas o vistas. Esto evita incoherencias de contadores que había en el sistema anterior.

Antes de unir una migración:

1. Arranca una base de datos limpia y aplica todas las migraciones.
2. Comprueba que las restricciones admiten los flujos reales.
3. Incluye índices para la consulta que justifica la tabla o el campo nuevo.
