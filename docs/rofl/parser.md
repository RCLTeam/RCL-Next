# Motor de Parsing y CLI de Repeticiones ROFL

[⬅️ Volver a ROFL Pipeline](README.md) | [Siguiente: Formato Binario ➡️](binary-format.md)

---

## 1. Visión General

El motor de extracción de datos de repeticiones de League of Legends se encuentra centralizado en el script `apps/parser/roflParser.py`. Este módulo implementa un parser CLI y programático en Python 3 puro (sin dependencias externas) optimizado para inspeccionar el bloque de metadatos de los archivos `.rofl` y generar un documento JSON estructurado con las estadísticas individuales de cada jugador, los agregados de equipo y los metadatos de la partida.

---

## 2. Interfaz de Línea de Comandos (CLI)

El parser puede ejecutarse de forma independiente desde la terminal o como subproceso invocado por el backend de Node.js:

```bash
python3 apps/parser/roflParser.py <path> [-o OUTPUT] [-q]
```

### Argumentos y Opciones (`roflParser.py:423-444`)

| Argumento / Flag | Tipo | Obligatorio | Descripción |
|---|---|:---:|---|
| `path` | Posicional (`str`) | **Sí** | Ruta al archivo `.rofl` de entrada en el sistema de archivos. |
| `-o`, `--output` | Opción (`str`) | No | Ruta del archivo `.json` de destino. Si se omite, se genera junto al archivo original añadiendo el sufijo `_estadisticas.json` (`roflParser.py:11, 392-395`). |
| `-q`, `--quiet` | Flag (`bool`) | No | Suprime los mensajes informativos en `stdout`, emitiendo únicamente errores por `stderr` (`roflParser.py:417-419`). |

---

## 3. Matriz Estricta de Códigos de Salida

El parser define una jerarquía de excepciones que se traducen en códigos de salida numéricos unívocos en el método `main()` (`roflParser.py:15-21, 24-46, 446-464`). Esta categorización permite que el orquestador en Node.js identifique de manera no ambigua la causa exacta del fallo:

| Constante Simbólica | Código | Clase de Excepción | Causa Raíz / Condición Desencadenante |
|---|:---:|---|---|
| `EXIT_SUCCESS` | `0` | N/A | Extracción completada y archivo JSON escrito exitosamente en disco (`roflParser.py:15, 456`). |
| `EXIT_GENERIC_ERROR` | `1` | `Exception` / `RoflParserError` | Excepción genérica imprevista durante la ejecución (`roflParser.py:16, 25, 462`). |
| `EXIT_FILE_NOT_FOUND` | `10` | `RoflFileNotFoundError` | El archivo no existe o la ruta especificada es un directorio (`roflParser.py:17, 28-29, 110-111, 452`). |
| `EXIT_INVALID_MAGIC_HEADER` | `11` | `InvalidMagicHeaderError` | Los primeros 4 bytes no coinciden con `b"RIOT"` (`roflParser.py:18, 32-33, 83-87`). |
| `EXIT_INVALID_PAYLOAD_LENGTH` | `12` | `InvalidPayloadLengthError` | Archivo menor a 8 bytes, longitud $n \le 0$, $n > 10\text{ MB}$, o $n$ mayor que el tamaño total del archivo (`roflParser.py:19, 36-37, 89-105`). |
| `EXIT_CORRUPT_METADATA` | `13` | `CorruptMetadataError` | Metadata no decodificable en UTF-8, JSON primario inválido, o campo `statsJson` inexistente / no parseable (`roflParser.py:20, 40-41, 114-121, 303-314`). |
| `EXIT_OUTPUT_WRITE_ERROR` | `14` | `OutputWriteError` | Fallo de E/S del sistema operativo al escribir el JSON resultante (permisos denegados, disco lleno) (`roflParser.py:21, 44-45, 414-415`). |

---

## 4. Cotas de Seguridad y Límites de Memoria

Para neutralizar vectores de denegación de servicio (DoS) como archivos con trailers manipulados que declaren tamaños astronómicos para provocar asignaciones masivas en memoria, el parser impone cotas fijas:

1. **Límite Máximo de Metadata:**
   ```python
   # apps/parser/roflParser.py:13, 100-101
   MAX_METADATA_SIZE: int = 10 * 1024 * 1024  # 10 MB
   if n <= 0 or n > MAX_METADATA_SIZE:
       raise InvalidPayloadLengthError(f"Longitud de metadata inválida: {n}")
   ```
2. **Tamaño Mínimo Físico:**
   El archivo debe medir como mínimo 8 bytes (4 bytes de cabecera mágica + 4 bytes de trailer de longitud). Si `total_size < 8`, se rechaza con código `12` (`roflParser.py:90-92`).
3. **Consistencia de Límites de Fragmento:**
   Se comprueba que `total_size >= 4 + n + 4`. La carga útil declarada no puede ser superior al tamaño del archivo excluyendo la cabecera y el trailer (`roflParser.py:103-104`).

---

## 5. Orquestación Concurrente en Node.js (`execute-python-parser.ts`)

La ejecución de `roflParser.py` dentro del backend de la API está gestionada por el módulo `apps/api/src/modules/rofl-upload/processing/execute-python-parser.ts`.

### 5.1 Concurrencia Delimitada por Núcleos Físicos
Para impedir que la ejecución paralela de múltiples instancias de Python sature la CPU y deje sin capacidad de respuesta al bucle de eventos (*Event Loop*) de Node.js o a las conexiones WebSocket:

```typescript
// apps/api/src/modules/rofl-upload/processing/execute-python-parser.ts:12-15, 79-82
export const MAX_PARSER_CONCURRENCY = Math.max(
  1,
  (os.availableParallelism?.() ?? os.cpus().length) - 1
);

const effectiveConcurrency = Math.min(
  options.concurrency ?? MAX_PARSER_CONCURRENCY,
  MAX_PARSER_CONCURRENCY
);
```
En un servidor con 8 núcleos lógicos, el sistema reserva obligatoriamente 1 núcleo para la infraestructura y despacha un máximo de 7 subprocesos en paralelo.

### 5.2 Control de Tiempos y Buffers de Subproceso
Cada invocación a través de `execFileAsync` (`execute-python-parser.ts:100-106`) se encuentra blindada por:
- **Timeout duro de 45 segundos (`timeout: 45000`):** Si el subproceso de Python no responde tras 45 segundos, el runtime de Node.js emite un `SIGTERM` y aborta con error explicativo (`execute-python-parser.ts:108-113`).
- **Buffer máximo de 10 MB (`maxBuffer: 10 * 1024 * 1024`):** Acota el consumo de memoria para capturar salidas de `stdout` o `stderr` anómalamente extensas (`execute-python-parser.ts:101`).

### 5.3 Tolerancia a Archivos No-ROFL en Lotes ZIP
Cuando se descomprime un paquete `.zip` que contiene archivos que no son repeticiones válidas de LoL (por ejemplo, ficheros `.DS_Store`, imágenes o documentos adjuntos con extensión alterada):
- Si el parser sale con `EXIT_CODE_INVALID_MAGIC_HEADER` (`11`), el subproceso **no rompe la transacción global** (`execute-python-parser.ts:116-127`). El archivo se clasifica en `skippedFiles`, se emite una advertencia al cliente vía `onWarning` (`El archivo '...' no tiene la cabecera ROFL válida y ha sido omitido`) y continúa el procesamiento del resto del lote.

> [!NOTE]
> **Comportamiento Específico:** Si todos los archivos del lote son inválidos y `validRoflCount === 0`, la línea `execute-python-parser.ts:156-160` detiene la operación arrojando `Error('No valid ROFL files found in batch to process (all files had invalid ROFL headers)')`, impidiendo ejecutar pasos posteriores de base de datos.
> Asimismo, `validateParserFileCounts(validRoflCount, validJsonFiles.length)` (`execute-python-parser.ts:34-40, 162`) exige que por cada archivo ROFL válido exista estrictamente un archivo JSON en disco, de lo contrario aborta.

---

## 6. Ordenación Natural Determinista de Mapas Importados (`orderImportedGames`)

Tras completar la inserción por lotes de las partidas pertenecientes a una serie o enfrentamiento competitivo, el repositorio asegura que los mapas importados queden indexados de acuerdo con su orden cronológico y secuencial natural. Esta lógica está implementada en la función `orderImportedGames(tx, matchId)` (`apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:41-83`).

### 6.1 Propósito y Ordenación Alfanumérica Natural

Cuando se importan múltiples archivos `.rofl` con identificadores externos (`externalGameId`, tales como `EUW1-1`, `EUW1-2`, `EUW1-10`), una ordenación puramente léxica situaría erróneamente `EUW1-10` antes de `EUW1-2`. Para garantizar que la columna `game_number` refleje con exactitud la secuencia deportiva:

```typescript
// apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:51-58
// Keep maps without a replay identifier in their existing positions.
const imported = games.filter((game) => game.externalGameId !== null);
const sorted = [...imported].sort((a, b) =>
  (a.externalGameId ?? '').localeCompare(b.externalGameId ?? '', undefined, {
    numeric: true,
    sensitivity: 'base'
  })
);
```

- **Aislamiento de Mapas Manuales:** La función filtra exclusivamente los mapas con `externalGameId !== null` (`imported`). Aquellas partidas registradas de forma manual sin archivo de repetición preservan inalteradas sus posiciones preexistentes.
- **Comparación Natural:** El parámetro `{ numeric: true, sensitivity: 'base' }` en `localeCompare` evalúa los segmentos numéricos por su magnitud real, garantizando la secuencia `EUW1-1` $\rightarrow$ `EUW1-2` $\rightarrow$ `EUW1-10`.
- **Verificación de Cortocircuito (No-op):** Si el orden actual de `imported` ya coincide elemento a elemento con la secuencia ordenada (`sorted.every((game, index) => game.id === imported[index]?.id)`), la función retorna de inmediato sin emitir operaciones de actualización sobre PostgreSQL (`postgres-rofl-upload.repository.ts:59`).

### 6.2 Algoritmo de Desplazamiento Atómico ante la Restricción `UNIQUE`

En la base de datos, la tabla `match_games` impone una restricción de unicidad relacional compuesta:
```sql
UNIQUE (matches_id, game_number)
```
Si se intentara reordenar dos mapas intercambiando directamente sus valores de `game_number`, la ejecución arrojaría de inmediato una colisión de clave única (`duplicate key value violates unique constraint "match_games_matches_id_game_number_unique"`). Para reordenar de forma atómica y determinista:

1. **Contexto Transaccional ACID:**
   La función opera dentro de la misma transacción en la que el partido padre (`matches`) se encuentra bloqueado pesimistamente con `FOR UPDATE`, garantizando aislamiento absoluto frente a lecturas o escrituras simultáneas.

2. **Búsqueda de Posición Temporal Libre:**
   Se calcula la menor posición libre dentro del rango válido de enteros pequeños de PostgreSQL (`smallint`, 1 a 32767) que no esté ocupada por ninguna partida del partido:
   ```typescript
   // apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:60-64
   const positions = new Map(games.map((game) => [game.id, game.gameNumber]));
   const occupied = new Set(positions.values());
   let temporary = 1;
   while (occupied.has(temporary) && temporary <= 32767) temporary++;
   if (temporary > 32767) throw new Error('No free position is available to order imported maps.');
   ```

3. **Desplazamiento Atómico en Tres Fases (*Three-Way Swap*):**
   Al iterar sobre los mapas ordenados (`sorted`), para cada partida cuyo `target` posicional difiere de su posición actual (`current`):
   - Si la posición `target` está ocupada por otra partida (`other`), dicha partida `other` se desplaza transitoriamente a la posición `temporary` libre.
   - La partida en curso (`game.id`) se actualiza a su posición definitiva `target`.
   - La partida desplazada (`other`) se mueve a la posición liberada `current`.
   - Si la posición `target` no estaba ocupada, se ejecuta un único `UPDATE` hacia `target`.
   ```typescript
   // apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:72-82
   for (const [index, game] of sorted.entries()) {
     const target = imported[index]?.gameNumber;
     const current = positions.get(game.id);
     if (target === undefined || current === undefined || current === target) continue;
     const other = [...positions].find(([, position]) => position === target)?.[0];
     if (other) {
       await move(other, temporary);
       await move(game.id, target);
       await move(other, current);
     } else await move(game.id, target);
   }
   ```
   Este mecanismo garantiza que en ningún momento intermedio existan dos filas compartiendo el mismo `(matches_id, game_number)`, cumpliendo estrictamente con la integridad del esquema relacional.
