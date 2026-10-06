# Restricciones y Límites de Infraestructura de Pruebas

[⬅️ Volver a Estrategia de Pruebas](README.md) | [Siguiente: Suites de Pruebas ➡️](suites/README.md)

---

## 1. Resumen Ejecutivo

La infraestructura de pruebas automatizadas de RCL-Next opera bajo un conjunto estricto de parámetros de configuración y límites de recursos en memoria diseñados para garantizar la estabilidad del sistema, evitar bloqueos de CPU y prevenir el agotamiento de memoria durante la ejecución de los 897 casos de prueba.

Este documento cataloga las restricciones físicas, dependencias de compilación y cuotas de ejecución de los tres entornos del arnés de pruebas: el motor de base de datos embebida en memoria (**PGlite**), la cadena de empaquetado de TypeScript (**pnpm build:packages**) y el entorno de subprocesos nativos de **Python 3**.

---

## 2. Restricciones del Motor de Base de Datos Embebida (PGlite)

Las pruebas de integración en `tests/integration/` no se conectan a un servidor PostgreSQL externo ni utilizan contenedores Docker; en su lugar, utilizan **PGlite** (`@electric-sql/pglite` v0.3.14), que ejecuta el núcleo de PostgreSQL compilado en WebAssembly/C directamente en el proceso de Node.js.

### 2.1 Techo de Trabajadores Concurrentes (`maxWorkers: 4`)
- **Configuración:** `vitest.config.ts:18`.
- **Límite:** Máximo de **4 procesos de trabajo concurrentes**.
- **Justificación de Ingeniería:** Durante el inicio de la suite completa, cada trabajador de Vitest crea una instancia independiente de PGlite y compila/aplica la totalidad de las 21 tablas relacionales y disparadores PL/pgSQL (`packages/database/drizzle/0000_initial_schema.sql`). La inicialización masiva simultánea genera una intensa contención de CPU en la compilación JIT de WebAssembly. Limitar la concurrencia a 4 núcleos mantiene la latencia de inicialización acotada y previene la saturación del planificador de hilos del sistema operativo.

### 2.2 Tiempo Límite de Ejecución (`testTimeout: 30_000`)
- **Configuración:** `vitest.config.ts:19`.
- **Límite:** **30.000 milisegundos (30 segundos)** por prueba.
- **Justificación de Ingeniería:** Aunque las pruebas individuales se ejecutan en decenas de milisegundos, el tiempo acumulado de arranque de la instancia en memoria, la lectura del sistema de archivos, la ejecución de la migración relacional consolidada y la siembra transaccional de demostración (`demo.sql`) puede extenderse en máquinas con alta carga. El umbral de 30 segundos previene falsos positivos por *timeout* sin enmascarar bloqueos indefinidos o deadlocks.

### 2.3 Ciclo de Vida y Limpieza de Memoria Heap
- **Patrón Obligatorio:** En cada bloque de prueba de integración, la instancia debe cerrarse explícitamente al concluir el contexto:
  ```typescript
  const client = new PGlite();
  t.onTestFinished(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  ```
- **Riesgo Mitigado:** Si el método `client.close()` no se registra en el hook `onTestFinished`, la memoria asignada al runtime de PostgreSQL/WASM permanece anclada al recolector de basura de V8, provocando un desbordamiento de memoria heap de Node.js (*JavaScript heap out of memory*) al procesar las 25 suites de integración consecutivas.

### 2.4 Serialización de Transacciones
- **Restricción:** PGlite tiene una única conexión y ejecuta las transacciones de una en una; las consultas lanzadas fuera de una transacción esperan a que termine la que está abierta.
- **Consecuencia:** Dos llamadas lanzadas en paralelo con `Promise.all` intercalan sus consultas previas a la transacción, pero sus transacciones no se solapan. Una prueba de concurrencia reproduce las carreras entre una lectura previa y una transacción posterior (por ejemplo, la comprobación de duplicados de la subida ROFL), pero no dos transacciones de `READ COMMITTED` abiertas a la vez como en un servidor PostgreSQL real.
- **Mitigación en las pruebas:** Las ramas que solo se alcanzan con transacciones solapadas se cubren simulando el estado intermedio (por ejemplo, una subclase del repositorio cuya primera lectura no ve las filas confirmadas), como en `tests/integration/rofl-upload-repository.test.ts`.

---

## 3. Prerrequisitos de Compilación de Paquetes Internos

El monorepo RCL-Next utiliza una arquitectura de espacios de trabajo gestionada por pnpm (`pnpm-workspace.yaml`), con dos paquetes compartidos fundamentales:
- `@rcl/contracts`: Contratos tipados, DTOs y tipos de eventos (`packages/contracts/`).
- `@rcl/database`: Esquema Drizzle, tipos relacionales y scripts de migración (`packages/database/`).

### 3.1 Dependencia de Artefactos Compilados en `dist/`
- **Restricción:** Las aplicaciones consumidoras (`apps/api` y `apps/web`) y las suites de prueba resuelven `@rcl/contracts` y `@rcl/database` a través de los archivos de declaración e indexación generados en sus respectivas carpetas `dist/`.
- **Comando Obligatorio:** Antes de ejecutar `vitest run` de forma aislada, es obligatorio asegurar que los paquetes estén compilados:
  ```bash
  pnpm build:packages
  # Equivale a: pnpm --filter "./packages/*" build
  ```
- **Automatización en el Pipeline:** Los comandos de nivel superior `pnpm check` y `pnpm typecheck` ya incluyen automáticamente la invocación de `pnpm build:packages` antes de iniciar la verificación estática y la ejecución de pruebas (`package.json:16,24`).

---

## 4. Restricciones del Runtime de Python y Motor ROFL

El subsistema de extracción y análisis de repeticiones binarias de League of Legends reside en `apps/parser/roflParser.py` y se prueba mediante `apps/parser/tests/test_roflParser.py` y suites de integración de subprocesos.

### 4.1 Requisitos de Versión de Python
- **Versión Mínima Requerida:** **Python 3.10+** (instalada canónicamente en el sistema anfitrión).
- **Librería Estándar Pura:** El parser no utiliza dependencias externas de PyPI (cero paquetes en `pip`); opera exclusivamente con módulos de la librería estándar (`struct`, `json`, `os`, `sys`, `argparse`, `unittest`).

### 4.2 Cota Máxima de Tamaño de Metadatos (`MAX_METADATA_SIZE`)
- **Límite:** **10.485.760 bytes (10 MB)** (`apps/parser/roflParser.py:23`).
- **Control de Seguridad:** El trailer de 4 bytes al final del archivo `.rofl` codifica la longitud en formato *little-endian* (`struct.unpack('<I', payload)`). Si la longitud reportada es menor o igual a cero, o excede los 10 MB, el parser aborta de inmediato con el código de salida **12** (`EXIT_INVALID_PAYLOAD_LENGTH`), neutralizando ataques de denegación de servicio por asignación masiva de memoria (*payload bomb*).

### 4.3 Control de Tiempos de Espera y Procesos Zombi en Subprocesos
- **Límite en Backend Node.js:** 45 segundos de tiempo máximo de procesamiento por archivo (`apps/api/src/modules/rofl-upload/processing/rofl-parser.executor.ts`).
- **Suite de Verificación:** `tests/integration/rofl-parser-timeout-adversarial.test.ts:1-107`.
- **Garantía:** Si un subproceso de Python no responde en el tiempo asignado (por ejemplo, ante archivos maliciosos que provoquen bucles infinitos de descompresión), el proceso padre de Node.js emite una señal `SIGKILL` forzada, cierra los descriptores de entrada/salida y libera el worker de la cola FIFO para permitir la continuidad del servicio.
