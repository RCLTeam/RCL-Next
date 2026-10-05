# Estrategia y Metodología de Pruebas

[⬅️ Volver a Estrategia de Pruebas](README.md) | [Siguiente: Límites de Entorno ➡️](environment-limits.md)

---

## 1. Resumen Ejecutivo

La estrategia de pruebas de RCL-Next articula un ecosistema de verificación automatizada multinivel diseñado para garantizar que ninguna regresión funcional, corrupción de datos o vulnerabilidad de seguridad alcance el entorno de producción. La suite combina pruebas unitarias puras, pruebas de renderizado de componentes desacoplados, pruebas de integración relacional sobre bases de datos efímeras en memoria y baterías de pruebas de caos e inyección adversaria.

El monorepo cuenta con **77 archivos de pruebas** que ejecutan **897 pruebas**, todas en estado verde (**100% de éxito, 0 pruebas fallidas**), verificables de forma determinista y reproducible tanto en entornos de desarrollo local como en flujos de integración continua (CI/CD).

---

## 2. Tecnologías y Entornos de Ejecución

El arnés de pruebas del monorepo integra las siguientes herramientas especializadas:

1. **Vitest v3 (`vitest: ^3.0.7`):** Ejecutor principal para TypeScript y JavaScript, configurado en `vitest.config.ts` con el proveedor de cobertura `v8` (`@vitest/coverage-v8: ^3.0.7`) y entorno base `node` (`vitest.config.ts:17`).
2. **PGlite (`@electric-sql/pglite: ^0.3.14`):** Instancia embebida de PostgreSQL compilada a WebAssembly/C que se ejecuta en memoria dentro del propio proceso de Node.js, eliminando la necesidad de daemons externos de base de datos o contenedores Docker durante las pruebas de integración.
3. **Shim de Compatibilidad `node:test` (`tests/support/node-test-shim.ts`):** Adaptador que traduce las primitivas de prueba nativas de Node.js (`test`, `t.test`, `t.after`) a la semántica de Vitest (`TaskContext`), permitiendo ejecutar suites nativas sin reescritura de código.
4. **Python `unittest`:** Entorno estándar de pruebas unitarias para el motor de parsing binario `apps/parser/roflParser.py`, ejecutado sin dependencias externas mediante `python3 -m unittest`.

---

## 3. Niveles de Pruebas (Test Tiers)

```
Nivel 5: Caos y Pruebas Adversarias (Desconexiones WS, Tampering, Inyección)
Nivel 4: Motor Binario Python (Lectura O(1), Validación Magic Header b"RIOT")
Nivel 3: Integración Relacional Cross-Layer (PGlite + Migraciones Drizzle)
Nivel 2: Renderizado e Interfaz de Usuario (Dumb UI, Aislamiento de Red)
Nivel 1: Pruebas Unitarias de Módulo (Co-ubicadas en apps/api y apps/web)
```

### Nivel 1 — Pruebas Unitarias de Módulo
- **Ubicación:** Co-ubicadas en `apps/api/src/` (15 archivos, 128 pruebas) y `apps/web/src/` (21 archivos, 127 pruebas).
- **Alcance:** Funciones puras, utilidades de formateo, reducers de máquina de estados (`suggestion-reducer.test.ts`), clientes de API con simulación de respuestas (`discord-bridge.client.test.ts`) y validación de variables de entorno (`env.test.ts`).
- **Garantía:** Aislamiento total de I/O de disco y red, con tiempos de ejecución en el rango de milisegundos.

### Nivel 2 — Pruebas de Renderizado e Interfaz (*Dumb UI*)
- **Ubicación:** `tests/unit/render/` (9 archivos, 65 pruebas) y `tests/unit/` (6 archivos, 37 pruebas).
- **Alcance:** Verificación de renderizado de componentes de React 19 (`AdminPage.test.tsx`, `SiteLayout.test.tsx`, `competition-pages.test.tsx`, `rofl-upload.test.tsx`, `DataState.test.tsx`).
- **Garantía:** Certifica que los componentes de presentación pura (*Dumb Components*) no instancian `fetch` ni `WebSocket`, reciben datos exclusivamente vía *props* y muestran estados de carga, error y datos de manera determinista.

### Nivel 3 — Pruebas de Integración Relacional (PGlite)
- **Ubicación:** `tests/integration/` (25 archivos, 529 pruebas).
- **Alcance:** Flujos completos entre rutas HTTP/WebSocket, repositorios Drizzle y la base de datos PostgreSQL en memoria. Cada prueba instancia un cliente `new PGlite()`, ejecuta `migrate(db, { migrationsFolder })` aplicando las 21 tablas relacionales y prueba transacciones ACID reales.
- **Garantía:** Verificación de restricciones `CHECK`, índices únicos parciales, claves foráneas en cascada y disparadores PL/pgSQL diferidos (`complete_player_game`).

### Nivel 4 — Pruebas del Motor Binario ROFL (Python)
- **Ubicación:** `apps/parser/tests/test_roflParser.py` (1 archivo, 11 pruebas).
- **Alcance:** Desempaquetado del archivo binario `data/EUW1-7982902321.rofl`, lectura inversa del trailer de longitud, extracción de 10 participantes, KDA, runas y objetos, y verificación de los códigos de salida de la CLI (0 a 14) ante archivos corruptos o inexistentes.
- **Garantía:** Cero dependencias de paquetes pip; compatibilidad estricta con Python 3.10+.

### Nivel 5 — Pruebas de Caos y Estrés Adversario
- **Ubicación:** `tests/integration/tier5-chaos-concurrency.test.ts`, `tests/integration/tier5-adversarial-challenger.test.ts`, `tests/integration/auth-adversarial.test.ts`, `tests/integration/rofl-concurrency-adversarial.test.ts`, `tests/integration/auth-websocket-adversarial.test.ts`.
- **Alcance:** Inyección de cargas hostiles:
  - Desconexión abrupta de sockets WebSocket a mitad de transferencia binaria.
  - Sobrecarga de buffers de memoria y violación de cuotas de subida (código WS 1009).
  - Alteración criptográfica y falsificación de cookies de sesión administrativa.
  - Inyección de secuencias maliciosas de caracteres en volcados de base de datos.
  - Fuzzing de estado y propiedades aleatorias en el buzón de sugerencias (`suggestions-opaque-e2e.test.ts`, 345 pruebas).

---

## 4. Matriz de Comandos de Verificación

Todas las pruebas del monorepo pueden ejecutarse y certificarse mediante la siguiente matriz de comandos verificados empíricamente:

| Comando | Subcomandos Ejecutados | Tiempo Medido | Resultado / Salida Esperada | Código de Salida |
|---|---|---:|---|:---:|
| `pnpm check` | `pnpm typecheck`<br>`biome check .`<br>`vitest run` | ~13.7s | Verificación integral: tipado limpio en todos los workspaces, 0 advertencias de linter/formateador, 76 suites y 886 pruebas de Vitest superadas. | **0** |
| `vitest run` | `vitest run` | ~13.5s | Ejecuta los 76 archivos de prueba de TypeScript en paralelo acotado (4 workers). 886 pruebas pasadas. | **0** |
| `python3 -m unittest discover apps/parser/tests` | `test_roflParser.py` | ~0.010s | Ejecuta las 11 pruebas del motor de parsing binario ROFL en Python. 11 pruebas pasadas. | **0** |
| `pnpm db:generate` | `drizzle-kit generate` | ~3.2s | Inspecciona `drizzle.config.ts` y las 21 tablas relacionales. Confirma 0 cambios pendientes de migración. | **0** |

---

## 5. Particularidades de Co-ubicación de Pruebas en el Monorepo

Conforme al diseño de la suite de pruebas del monorepo, se documentan de forma explícita las decisiones de ubicación de pruebas que difieren de la regla de co-ubicación unitaria:

1. **Módulos de API sin pruebas unitarias co-ubicadas directas:**
   - *Observación:* Los directorios `apps/api/src/modules/crud-operations/`, `apps/api/src/modules/home-content/` y `apps/api/src/modules/member-roles/` no contienen archivos `*.test.ts` co-ubicados (0 pruebas unitarias directas en su carpeta).
   - *Cobertura real:* Se prueban exhaustivamente en la capa de integración relacional contra PGlite:
     - `tests/integration/crud-operations.test.ts` (20 pruebas, 763 LoC): prueba bloqueos de borrado en cascada, auditoría de transacciones y operaciones CRUD relacionales completas.
     - `tests/integration/home-content.test.ts` (6 pruebas, 453 LoC): prueba la persistencia de artículos editoriales y selección del quinteto ideal.
     - `tests/integration/member-roles.test.ts` (6 pruebas, 169 LoC): prueba la promoción y degradación de roles de sistema (`viewer`, `admin`, `owner`).
   - *Razón de diseño:* Estos módulos están fuertemente acoplados a la semántica transaccional de PostgreSQL y a restricciones de clave foránea; simular la base de datos con mocks unitarios crearía aserciones falsamente optimistas (*self-certification trap*), por lo que se priorizó su prueba directa contra el motor relacional real.

2. **Funcionalidades Web sin pruebas unitarias en su carpeta de feature:**
   - *Observación:* Las carpetas `apps/web/src/features/auth/` y `apps/web/src/features/rofl-upload/` no tienen archivos de prueba directos dentro de su árbol local.
   - *Cobertura real:*
     - `auth`: se prueba visualmente en `tests/unit/render/AuthControls.test.tsx` (6 pruebas) e integralmente en `tests/integration/auth*.test.ts` (51 pruebas).
     - `rofl-upload`: el hook desacoplado de subida WebSocket se prueba en `tests/unit/useRoflUploadWs.test.ts` (16 pruebas) y los controles visuales en `tests/unit/render/rofl-upload.test.tsx` (7 pruebas).

3. **Páginas de la Web sin suite de renderizado dedicada:**
   - *Observación:* La ruta `crystal-ball` no cuenta con un archivo de prueba individual dedicado en `apps/web/src/site/pages/`.
   - *Cobertura real:* Se verifica a nivel de resolución de tabla de enrutamiento en `apps/web/src/site/routes.test.tsx` (3 pruebas) y montaje global en `tests/unit/render/App.test.tsx` (6 pruebas).
