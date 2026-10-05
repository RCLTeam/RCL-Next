# Catálogo de Suites de Pruebas: Parser Binario ROFL (Python)

[⬅️ Volver a Suites de Pruebas](README.md) | [Siguiente: Suites de Integración ➡️](integration.md)

---

## 1. Resumen Ejecutivo

El motor de extracción de repeticiones binarias de League of Legends está implementado en Python 3 (`apps/parser/roflParser.py`) y se valida exhaustivamente mediante su suite de pruebas unitarias dedicada: `apps/parser/tests/test_roflParser.py` (**12 pruebas, 254 líneas de código**).

La suite opera de forma instantánea (**~0.013 segundos** de ejecución) sobre la librería estándar de Python sin requerir ningún paquete de terceros (`pip`), validando el algoritmo de lectura inversa $O(1)$, la extracción de los 10 participantes del fixture anonimizado `apps/parser/data/RCL-FIXTURE-0001.rofl` y el contrato estricto de códigos de salida de la CLI (0 a 14) ante repeticiones truncadas o deliberadamente maliciosas.

---

## 2. Inventario de Pruebas Unitarias (`test_roflParser.py`)

La clase `TestRoflParser` implementa 12 métodos de prueba que cubren tanto la interfaz programática (`parse_rofl()`) como la interfaz de línea de comandos (`main()`):

| # | Método de Prueba | Líneas | Tipo de Prueba | Aserciones y Comportamiento Verificado |
|---|---|---:|---|---|
| 1 | `test_sample_rofl_exists` | 45-50 | Fixture | Certifica la presencia del archivo de repetición sintético de prueba en `apps/parser/data/RCL-FIXTURE-0001.rofl`. |
| 2 | `test_parse_fixture_rofl` | 52-99 | Integración Parser | Parsea el fixture ROFL a un archivo JSON temporal y valida: versión de esquema (2), exactamente 10 jugadores, equipo ganador (100 vs 200), KDA (kills, deaths, assists), runas primarias/secundarias/fragmentos, 7 ranuras de objetos por jugador y equivalencia binaria con el resultado de referencia en `apps/parser/result/RCL-FIXTURE-0001_estadisticas.json`, que debe existir. |
| 3 | `test_fixture_uses_only_synthetic_identities` | 101-125 | Privacidad del Fixture | Comprueba que el fixture solo contiene identidades ficticias: archivo `RCL-FIXTURE-0001.rofl`, nombres `Anon Azul 1-5` / `Anon Rojo 1-5`, tag `ANON`, PUUID con el patrón `00000000-0000-4000-8000-0000000000NN` y `SUMMONER_ID` / `ID` entre 1 y 10 en el `statsJson` sin procesar. Impide que se vuelva a incorporar una repetición con jugadores reales. |
| 4 | `test_invalid_header_rejection` | 127-139 | Seguridad de Entrada | Comprueba que un archivo binario que carece de la cabecera mágica `b"RIOT"` lance inmediatamente una excepción `ValueError` con el mensaje descriptivo `"Cabecera ROFL no reconocida"`. |
| 5 | `test_file_too_small_rejection` | 141-153 | Seguridad de Entrada | Verifica que archivos con un tamaño menor a 8 bytes sean rechazados con `ValueError` (`"Archivo ROFL demasiado pequeño"`), protegiendo contra punteros de lectura fuera de rango. |
| 6 | `test_invalid_metadata_length_rejection` | 155-167 | Cotas de Memoria | Comprueba que trailers con longitudes reportadas $\le 0$ o superiores a `MAX_METADATA_SIZE` (10 MB) sean rechazados con `ValueError` (`"Longitud de metadata inválida"`), mitigando ataques de *payload bomb*. |
| 7 | `test_cli_main_success_and_quiet` | 169-181 | CLI Éxito | Ejecuta la función `main()` con los argumentos `-o <path>` y flag silencioso `-q`, confirmando que retorna código de salida `0` y que el archivo de salida se crea con contenido positivo. |
| 8 | `test_cli_main_file_not_found` | 183-189 | CLI Error 10 | Verifica que invocar el parser sobre una ruta inexistente capture el error en `stderr` y retorne el código constante `EXIT_FILE_NOT_FOUND` (**10**). |
| 9 | `test_cli_main_invalid_magic_header` | 191-205 | CLI Error 11 | Simula un archivo que no inicia con `b"RIOT"` y comprueba que la CLI retorne `EXIT_INVALID_MAGIC_HEADER` (**11**). Nota: este código es utilizado por el backend para discriminar archivos ajenos dentro de un ZIP sin abortar el lote. |
| 10 | `test_cli_main_invalid_payload_length` | 207-221 | CLI Error 12 | Simula un trailer con longitud de metadata nula o sobredimensionada y valida el retorno de `EXIT_INVALID_PAYLOAD_LENGTH` (**12**). |
| 11 | `test_cli_main_corrupt_metadata` | 223-239 | CLI Error 13 | Escribe una carga útil con JSON no balanceado o sintaxis inválida y confirma que la CLI retorne `EXIT_CORRUPT_METADATA` (**13**). |
| 12 | `test_cli_main_output_write_error` | 241-250 | CLI Error 14 | Emula un fallo de E/S en disco (disco lleno o permisos insuficientes) mediante parcheo con `unittest.mock.patch` y verifica que se retorne `EXIT_OUTPUT_WRITE_ERROR` (**14**). |

---

## 3. Matriz de Códigos de Salida de la CLI

El diseño del parser define una asignación biunívoca entre tipos de error y códigos de salida enteros para permitir al subproceso de Node.js reaccionar de manera precisa:

| Código | Constante en Código | Causa Raíz / Condición de Disparo | Tratamiento en Backend Node.js |
|:---:|---|---|---|
| **0** | `EXIT_SUCCESS` | Procesamiento exitoso; metadatos generados correctamente. | Ingesta de JSON y persistencia en PostgreSQL. |
| **10** | `EXIT_FILE_NOT_FOUND` | La ruta del archivo `.rofl` especificada no existe en disco. | Error fatal del subproceso; notificación de fallo. |
| **11** | `EXIT_INVALID_MAGIC_HEADER` | Los primeros 4 bytes no son `b"RIOT"`. | Archivo no-ROFL ignorado silenciosamente si proviene de un ZIP. |
| **12** | `EXIT_INVALID_PAYLOAD_LENGTH` | El trailer de 4 bytes indica $\le 0$ o $> 10\text{ MB}$. | Bloqueo por seguridad; repetición catalogada como inválida. |
| **13** | `EXIT_CORRUPT_METADATA` | El bloque de metadatos no es un JSON válido o está truncado. | Repetición catalogada como corrupta. |
| **14** | `EXIT_OUTPUT_WRITE_ERROR` | No se pudo escribir el archivo JSON de salida en destino. | Fallo de sistema; revisión de permisos o espacio temporal. |

---

## 4. Comando de Ejecución y Verificación

La suite de pruebas de Python se ejecuta de forma independiente mediante:

```bash
python3 -m unittest discover apps/parser/tests
```

**Resultado verificado:**
```
............
----------------------------------------------------------------------
Ran 12 tests in 0.013s

OK
```

---

## 5. Fixture Anonimizado

`apps/parser/data/RCL-FIXTURE-0001.rofl` (~100 KB) es una repetición sintética que solo contiene la firma `b"RIOT"`, el bloque JSON de metadatos y el trailer de longitud; no incluye los bloques de paquetes de red. Las estadísticas de juego proceden de una partida real, pero el nombre del archivo, los Riot ID, los PUUID y los identificadores de invocador son ficticios. El mismo fixture lo consumen las suites de la API (`apps/api/src/modules/rofl-upload/rofl-upload.test.ts`, `tests/integration/rofl-upload-websocket.test.ts`, `tests/integration/rofl-websocket-end-to-end.test.ts`) y `tests/integration/rofl-stats.test.ts` lee su resultado esperado. El detalle de los valores sustituidos y cómo regenerar el JSON esperado está en el [README del parser](../../../apps/parser/README.md#fixture-de-pruebas-anonimizado).
