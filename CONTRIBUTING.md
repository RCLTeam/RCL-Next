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

## Organización de las pruebas

- Las pruebas de una función, componente o módulo se colocan junto al código, con el sufijo `.test.ts` o `.test.tsx`.
- `tests/integration/` contiene recorridos HTTP/WebSocket y pruebas con PGlite que conectan varias capas o aplicaciones.
- `tests/support/` contiene utilidades de infraestructura de pruebas, como el adaptador de `node:test` a Vitest.
- Las pruebas Python permanecen en `apps/parser/tests/`.

Vitest descubre pruebas en `apps/`, `packages/` y `tests/`. TypeScript también comprueba las pruebas colocadas junto al código, pero la compilación de la API usa `tsconfig.build.json` para excluirlas de producción.

Ejecuta `pnpm check` para comprobar tipos, formato y pruebas TypeScript; `pnpm build` verifica la compilación de producción. Ejecuta por separado `python -m unittest discover -s apps/parser/tests -p "test_*.py"` para el parser (o `python3` si ese es el ejecutable de tu entorno).

Antes de ejecutar Vitest directamente en un checkout nuevo, ejecuta `pnpm build:packages` para generar las exportaciones de los paquetes compartidos. Los comandos `dev:api`, `dev:web` y `typecheck` compilan sus paquetes necesarios automáticamente.

## Base de datos

Las tablas `match_games` y `player_game_stats` representan hechos históricos. Los totales de clasificación, KDA, win rate y picks se derivarán desde ahí mediante consultas o vistas. Esto evita incoherencias de contadores que había en el sistema anterior.

Antes de unir una migración:

1. Arranca una base de datos limpia y aplica todas las migraciones.
2. Comprueba que las restricciones admiten los flujos reales.
3. Incluye índices para la consulta que justifica la tabla o el campo nuevo.
