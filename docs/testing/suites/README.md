# Catálogo de Suites de Pruebas del Monorepo

[⬅️ Volver a Estrategia de Pruebas](../README.md) | [Siguiente: Suites API ➡️](api.md)

---

## 1. Resumen Ejecutivo

El monorepo RCL-Next cuenta con una cobertura integral compuesta por **79 archivos de pruebas** que ejecutan **901 pruebas verificadas**, totalizando **19.014 líneas de código de pruebas**. Todas las pruebas pasan sin excepciones (**100% de tasa de éxito, 0 pruebas fallidas**), y se certifica la existencia de **0 suites fantasma (*ghost suites*)** en todo el repositorio.

La distribución de suites abarca pruebas unitarias co-ubicadas en el backend y el frontend, pruebas de interfaz y renderizado en aislamiento, pruebas transversales de integración con base de datos en memoria, y pruebas nativas de bajo nivel para el motor de parsing de repeticiones en Python.

---

## 2. Censo Cuantitativo de Suites

| Dominio / Área del Proyecto | Ejecutor / Arnés | Archivos de Prueba | Total Pruebas | Líneas de Código (LoC) | Tasa de Aprobación |
|---|---|---:|---:|---:|:---:|
| **Backend API (`apps/api`)** | Vitest (v8 / Node) | 15 | 128 | 2.992 | 100% (128/128) |
| **Frontend Web (`apps/web`)** | Vitest (v8 / JSDOM-Node) | 23 | 131 | 2.438 | 100% (131/131) |
| **Parser ROFL (`apps/parser`)** | Python `unittest` | 1 | 11 | 218 | 100% (11/11) |
| **Integración Relacional (`tests/integration`)** | Vitest (PGlite en memoria) | 25 | 529 | 11.687 | 100% (529/529) |
| **Renderizado y Shell (`tests/unit`)** | Vitest (Node / Render) | 15 | 102 | 1.679 | 100% (102/102) |
| **Total Global del Monorepo** | | **79** | **901** | **19.014** | **100% (901/901)** |

---

## 3. Tabla de Contenidos de las Suites

| Catálogo | Enlace | Resumen del Dominio y Suites |
|---|---|---|
| **Suites Backend API** | [api.md](api.md) | Catálogo de las 15 suites de `apps/api` (128 pruebas): variables de entorno, cliente Discord OAuth, estadísticas de competición, cliente bridge de Discord, políticas de predicciones, procesamiento de repeticiones y buzón de sugerencias. |
| **Suites Frontend Web** | [web.md](web.md) | Catálogo de las 23 suites de `apps/web` (131 pruebas): clientes API, diálogos modales CRUD, panel de transferencias, hooks de puente, selector y filtrado de jornadas, formulario de sugerencias, reducers de estado, servicios CDN de Riot y páginas del sitio. |
| **Suites del Parser ROFL** | [parser.md](parser.md) | Catálogo de las 11 pruebas de `apps/parser/tests/test_roflParser.py`: validación de cabecera `b"RIOT"`, unpack de metadatos, integridad de 10 participantes y matriz de códigos de salida de la CLI (0-14). |
| **Suites de Integración y Renderizado** | [integration.md](integration.md) | Catálogo de las 25 suites de integración en `tests/integration/` (529 pruebas) y las 15 suites de renderizado en `tests/unit/` (102 pruebas): subida adversarial de repeticiones, seguridad OAuth, caos de WebSocket y suite E2E de sugerencias (345 pruebas). |

---

## 4. Criterio de Verificación de Suites Fantasma

Cada archivo de prueba fue auditado mediante análisis estático y ejecución en vivo para certificar que cumple con los siguientes requisitos:
1. **Presencia de Aserciones Reales:** Ninguna suite contiene llamadas vacías a `test()` o bloques `it()` comentados o sin aserciones comprobables.
2. **Validación de Casos Parametrizados:** Suites que emplean `it.each` (como `discord.client.test.ts` tanto en `apps/api` como en `tests/integration/`) ejecutan activamente sus 4 casos parametrizados de red, sanitización y errores de perfil.
3. **Cero Omisiones en Cobertura:** Todos los módulos críticos cuentan con trazabilidad hacia sus respectivas pruebas unitarias o hacia suites de integración relacional equivalentes.
