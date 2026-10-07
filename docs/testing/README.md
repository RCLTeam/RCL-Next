# Infraestructura y Estrategia de Pruebas

[⬅️ Volver al Índice Principal de Documentación](../README.md) | [Siguiente: Suites de Pruebas ➡️](suites/README.md)

---

La validación del proxy de avatares y el resultado de la ejecución del 4 de octubre de 2026 se documentan en [Pruebas del proxy de avatares](discord-avatars.md).

## 1. Resumen Ejecutivo

La infraestructura de aseguramiento de la calidad y pruebas de RCL-Next está diseñada para certificar la integridad deportiva, la coherencia relacional y la robustez ante fallos adversarios en todo el monorepo. La arquitectura de testing se fundamenta en un principio de **aislamiento determinista sin dependencias externas de infraestructura**, ejecutando la totalidad de la suite relacional sobre una instancia embebida de PostgreSQL en memoria mediante **PGlite** (`@electric-sql/pglite` v0.3.14).

Esta página no fija el número de archivos ni de pruebas, porque cambia con cada PR que añade suites. Los totales actuales los imprime cada ejecutor al terminar:

- **Vitest 3** para TypeScript: `pnpm test` (equivale a `vitest run`; también lo ejecuta `pnpm check`). El entorno es `node` (`vitest.config.ts:16`): no se usa JSDOM; los componentes React se renderizan a HTML con `react-dom/server` y las pruebas que necesitan `window`, `document` o `fetch` los sustituyen por dobles.
- **Python `unittest`** para el motor binario ROFL: `python3 -m unittest discover apps/parser/tests`.

El censo por archivo, con la fecha de su última medición y los comandos para repetirla, está en [suites/README.md](suites/README.md).

---

## 2. Niveles de Pruebas y Filosofía de Aislamiento

La pirámide de pruebas de RCL-Next se estructura en cinco niveles escalonados (*Tiers*):

1. **Nivel 1 — Pruebas Unitarias de Módulo (Co-ubicadas):** Pruebas de bajo acoplamiento situadas junto al código fuente en `apps/api/src/`, `apps/web/src/` y `packages/contracts/src/`, validando transformaciones funcionales puras, reducers de estado, clientes API y políticas de negocio.
2. **Nivel 2 — Pruebas de Renderizado e Interfaz (*Dumb UI*):** Pruebas en `tests/unit/render/` que certifican el aislamiento visual de los componentes de React 19, verificando que los componentes presentacionales no disparen efectos de red ni mutaciones de estado colaterales.
3. **Nivel 3 — Pruebas de Integración Relacional (PGlite):** Pruebas en `tests/integration/`; la mayoría levantan una base de datos PostgreSQL efímera e independiente con PGlite, aplicando el historial completo de migraciones Drizzle (`packages/database/drizzle/`) y validando transacciones ACID reales.
4. **Nivel 4 — Pruebas del Motor Binario ROFL:** Pruebas nativas en Python (`apps/parser/tests/test_roflParser.py`) que verifican el algoritmo de lectura inversa $O(1)$, la cabecera mágica `b"RIOT"` y la totalidad de los códigos de salida ante repeticiones truncadas o corruptas.
5. **Nivel 5 — Pruebas de Caos y Estrés Adversario:** Suites especializadas (`tier5-chaos-concurrency.test.ts`, `tier5-adversarial-challenger.test.ts`, `auth-adversarial.test.ts`, `rofl-concurrency-adversarial.test.ts`) que someten a la API a desconexiones abruptas de WebSocket, paquetes JSON sobredimensionados (*payload bomb*), falsificación de cookies de sesión y colisiones de concurrencia.

---

## 3. Tabla de Contenidos del Área

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Estrategia y Metodología** | [strategy.md](strategy.md) | Metodología de pruebas del monorepo, entornos de ejecución (Node, `react-dom/server` y PGlite), matriz de comandos (`pnpm check`, `vitest run`, `unittest`) y resultados esperados. |
| **Límites de Entorno e Infraestructura** | [environment-limits.md](environment-limits.md) | Restricciones de runtime: concurrencia de PGlite (`maxWorkers: 4`), timeouts de inicialización (30s), prerrequisitos de compilación de paquetes y límites de memoria del parser. |
| **Catálogo de Suites de Pruebas** | [suites/README.md](suites/README.md) | Censo por archivo, con fecha de medición, clasificado por dominio: backend API, frontend Web, parser Python e integración transversal. |

---

## 4. Garantías Arquitectónicas

1. **Cero Dependencia de Daemons Externos:** La suite de pruebas no requiere contenedores Docker activos ni servicios de base de datos instalados en el sistema anfitrión. PGlite ejecuta el motor de PostgreSQL compilado a WebAssembly/C dentro del proceso de Node.js.
2. **Determinismo y Paralelismo Acotado:** Para evitar contención de CPU y agotamiento de memoria durante la inicialización concurrente de múltiples instancias de PGlite, `vitest.config.ts:18-19` impone un límite estricto de **4 trabajadores concurrentes** (`maxWorkers: 4`) y un tiempo límite de **30 segundos** (`testTimeout: 30_000`).
3. **Reproducibilidad en CI/CD:** El comando unificado `pnpm check` garantiza la verificación secuencial de tipado (`pnpm typecheck`), análisis estático (`biome check .`) y ejecución de pruebas (`vitest run`), certificando la ausencia de regresiones en una sola orden de terminal.
