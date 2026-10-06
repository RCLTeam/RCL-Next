# Catálogo de Suites de Pruebas del Monorepo

[⬅️ Volver a Estrategia de Pruebas](../README.md) | [Siguiente: Suites API ➡️](api.md)

---

## 1. Resumen Ejecutivo

Este directorio es el censo por archivo de las pruebas del monorepo. Las cifras son una medición fechada, no un valor permanente: cada PR que añade, quita o amplía suites actualiza la fila correspondiente y, si cambia, la fecha. Para conocer el total actual basta con ejecutar `pnpm test` (Vitest) y `python3 -m unittest discover apps/parser/tests` (parser); el [apartado 5](#5-cómo-actualizar-este-censo) explica cómo obtener las cifras por archivo.

Medición del 6 de octubre de 2026: **97 archivos de pruebas y 1.149 pruebas** (96 archivos y 1.137 pruebas de Vitest, más 1 archivo y 12 pruebas de Python), **24.120 líneas brutas** (`wc -l`, incluidas líneas vacías y comentarios). Todas pasaron.

La distribución abarca pruebas unitarias co-ubicadas en el backend, el frontend y `packages/contracts`, pruebas de clientes y renderizado en `tests/unit/`, pruebas transversales de integración (en su mayoría con base de datos en memoria) y pruebas de bajo nivel del parser de repeticiones en Python.

---

## 2. Censo Cuantitativo de Suites (6 de octubre de 2026)

| Dominio / Área del Proyecto | Ejecutor / Entorno | Archivos de Prueba | Total Pruebas | LoC brutas | Aprobadas |
|---|---|---:|---:|---:|:---:|
| **Backend API (`apps/api`)** | Vitest (`node`) | 23 | 268 | 5.358 | 268/268 |
| **Contratos (`packages/contracts`)** | Vitest (`node`) | 1 | 3 | 28 | 3/3 |
| **Frontend Web (`apps/web`)** | Vitest (`node`, `react-dom/server`) | 28 | 168 | 2.962 | 168/168 |
| **Parser ROFL (`apps/parser`)** | Python `unittest` | 1 | 12 | 254 | 12/12 |
| **Integración (`tests/integration`)** | Vitest (PGlite en memoria o dobles) | 29 | 573 | 13.589 | 573/573 |
| **Clientes y Renderizado (`tests/unit`)** | Vitest (`node`, `react-dom/server`) | 15 | 125 | 1.929 | 125/125 |
| **Total Global del Monorepo** | | **97** | **1.149** | **24.120** | **1.149/1.149** |

---

## 3. Tabla de Contenidos de las Suites

| Catálogo | Enlace | Resumen del Dominio y Suites |
|---|---|---|
| **Suites Backend API** | [api.md](api.md) | Suites co-ubicadas de `apps/api` y `packages/contracts`: configuración del entorno, OAuth y cookie de sesión, proxy de avatares, competición, transferencia de base de datos, puente de Discord, metadatos de página, predicciones, subida de repeticiones, sitemap y buzón de sugerencias. |
| **Suites Frontend Web** | [web.md](web.md) | Suites co-ubicadas de `apps/web`: clientes API, diálogos CRUD, panel de transferencias, hooks del puente, editor de noticias, selector de jornadas, sugerencias, servicios CDN de Riot, hora de la liga, navegación y páginas del sitio. |
| **Suites del Parser ROFL** | [parser.md](parser.md) | Pruebas de `apps/parser/tests/test_roflParser.py`: cabecera `b"RIOT"`, fixture anonimizado, metadatos, 10 participantes y códigos de salida de la CLI (0-14). |
| **Suites de Integración y Renderizado** | [integration.md](integration.md) | Suites de `tests/integration/` (subida adversarial de repeticiones, OAuth, WebSocket, CRUD, sitemap, sugerencias de extremo a extremo) y de `tests/unit/` (clientes, hooks y renderizado aislado). |

---

## 4. Criterio de Verificación de Suites Fantasma

Cada archivo de prueba fue auditado mediante análisis estático y ejecución en vivo para certificar que cumple con los siguientes requisitos:
1. **Presencia de Aserciones Reales:** Ninguna suite contiene llamadas vacías a `test()` o bloques `it()` comentados o sin aserciones comprobables.
2. **Validación de Casos Parametrizados:** Suites que emplean `it.each` (como `discord.client.test.ts` tanto en `apps/api` como en `tests/integration/`) ejecutan activamente sus 4 casos parametrizados de red, sanitización y errores de perfil.
3. **Cero Omisiones en Cobertura:** Todos los módulos críticos cuentan con trazabilidad hacia sus respectivas pruebas unitarias o hacia suites de integración relacional equivalentes.

---

## 5. Cómo actualizar este censo

Desde la raíz del repositorio, con las dependencias instaladas:

```bash
pnpm build:packages
pnpm exec vitest run --reporter=json --outputFile=vitest-report.json
python3 -m unittest discover -v apps/parser/tests
wc -l <archivo de prueba>
```

- En el JSON de Vitest, `testResults` tiene una entrada por archivo y su `assertionResults` una por prueba; `numTotalTests` es el total de pruebas. `numTotalTestSuites` también cuenta los bloques `describe`, así que no equivale al número de archivos.
- Las pruebas parametrizadas (`it.each`, `test.each`) cuentan una vez por caso.
- `unittest` imprime una línea por prueba con `-v` y el total en `Ran N tests`.
- Borra `vitest-report.json` al terminar: no forma parte del repositorio.
