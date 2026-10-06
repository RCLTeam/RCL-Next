# Infraestructura y Estrategia de Pruebas

[⬅️ Volver al Índice Principal de Documentación](../README.md) | [Siguiente: Suites de Pruebas ➡️](suites/README.md)

---

La validación del proxy de avatares y el resultado de la ejecución del 4 de octubre de 2026 se documentan en [Pruebas del proxy de avatares](discord-avatars.md). Los censos históricos de esta página no representan esa ejecución.

## 1. Resumen Ejecutivo

La infraestructura de aseguramiento de la calidad y pruebas de RCL-Next está diseñada para certificar la integridad deportiva, la coherencia relacional y la robustez ante fallos adversarios en todo el monorepo. La arquitectura de testing se fundamenta en un principio de **aislamiento determinista sin dependencias externas de infraestructura**, ejecutando la totalidad de la suite relacional sobre una instancia embebida de PostgreSQL en memoria mediante **PGlite** (`@electric-sql/pglite` v0.3.14).

El censo de pruebas del monorepo certifica una cobertura exhaustiva y libre de pruebas vacías:
- **77 archivos de pruebas** distribuidos en todas las capas del proyecto.
- **897 pruebas unitarias, de integración y de estrés adversario**, con una tasa de éxito del **100% (0 fallos)**.
- **0 suites fantasma (*ghost suites*)**: cada archivo de pruebas contiene aserciones activas verificadas en ejecución.
- **Dos ejecutores complementarios**: **Vitest v3** (v8 runtime / JSDOM-Node) para TypeScript/JavaScript (76 archivos, 886 pruebas) y **Python unittest** para el motor binario ROFL (1 archivo, 12 pruebas).

---

## 2. Niveles de Pruebas y Filosofía de Aislamiento

La pirámide de pruebas de RCL-Next se estructura en cinco niveles escalonados (*Tiers*):

1. **Nivel 1 — Pruebas Unitarias de Módulo (Co-ubicadas):** Pruebas de bajo acoplamiento situadas junto al código fuente en `apps/api/src/` (15 archivos, 128 pruebas) y `apps/web/src/` (21 archivos, 127 pruebas), validando transformaciones funcionales puras, reducers de estado, clientes API y políticas de negocio.
2. **Nivel 2 — Pruebas de Renderizado e Interfaz (*Dumb UI*):** Pruebas en `tests/unit/render/` (15 archivos, 102 pruebas) que certifican el aislamiento visual de los componentes de React 19, verificando que los componentes presentacionales no disparen efectos de red ni mutaciones de estado colaterales.
3. **Nivel 3 — Pruebas de Integración Relacional (PGlite):** Pruebas en `tests/integration/` (25 archivos, 529 pruebas) que levantan una base de datos PostgreSQL efímera e independiente por cada hilo de ejecución, aplicando el historial completo de migraciones Drizzle (`packages/database/drizzle/`) y validando transacciones ACID reales.
4. **Nivel 4 — Pruebas del Motor Binario ROFL:** Pruebas nativas en Python (`apps/parser/tests/test_roflParser.py`, 12 pruebas) que verifican el algoritmo de lectura inversa $O(1)$, la cabecera mágica `b"RIOT"` y la totalidad de los códigos de salida ante repeticiones truncadas o corruptas.
5. **Nivel 5 — Pruebas de Caos y Estrés Adversario:** Suites especializadas (`tier5-chaos-concurrency.test.ts`, `tier5-adversarial-challenger.test.ts`, `auth-adversarial.test.ts`, `rofl-concurrency-adversarial.test.ts`) que someten a la API a desconexiones abruptas de WebSocket, paquetes JSON sobredimensionados (*payload bomb*), falsificación de cookies de sesión y colisiones de concurrencia.

---

## 3. Tabla de Contenidos del Área

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Estrategia y Metodología** | [strategy.md](strategy.md) | Metodología de pruebas del monorepo, entornos de ejecución (Node/JSDOM/PGlite), matriz de comandos (`pnpm check`, `vitest run`, `unittest`) y tiempos de ejecución. |
| **Límites de Entorno e Infraestructura** | [environment-limits.md](environment-limits.md) | Restricciones de runtime: concurrencia de PGlite (`maxWorkers: 4`), timeouts de inicialización (30s), prerrequisitos de compilación de paquetes y límites de memoria del parser. |
| **Catálogo de Suites de Pruebas** | [suites/README.md](suites/README.md) | Índice detallado de los 77 archivos de pruebas clasificados por dominio: backend API, frontend Web, parser Python e integración transversal. |

---

## 4. Garantías Arquitectónicas

1. **Cero Dependencia de Daemons Externos:** La suite de pruebas no requiere contenedores Docker activos ni servicios de base de datos instalados en el sistema anfitrión. PGlite ejecuta el motor de PostgreSQL compilado a WebAssembly/C dentro del proceso de Node.js.
2. **Determinismo y Paralelismo Acotado:** Para evitar contención de CPU y agotamiento de memoria durante la inicialización concurrente de múltiples instancias de PGlite, `vitest.config.ts:18-19` impone un límite estricto de **4 trabajadores concurrentes** (`maxWorkers: 4`) y un tiempo límite de **30 segundos** (`testTimeout: 30_000`).
3. **Reproducibilidad en CI/CD:** El comando unificado `pnpm check` garantiza la verificación secuencial de tipado (`pnpm typecheck`), análisis estático (`biome check .`) y ejecución de pruebas (`vitest run`), certificando la ausencia de regresiones en una sola orden de terminal.
