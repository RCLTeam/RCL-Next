# Pipeline de Procesamiento, Colas y Defensas Perimetrales

[⬅️ Volver a API ROFL Upload](README.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General

El núcleo de procesamiento del módulo `rofl-upload` se encarga de la gestión de archivos temporales en disco, la regulación de la velocidad de transferencia mediante contrapresión de E/S, la descompresión segura de lotes ZIP, la ejecución coordinada del parser de Python y la preparación cronológica de las partidas antes de su inserción en la base de datos.

Los componentes clave que integran esta capa residen en:
- `apps/api/src/modules/rofl-upload/processing/process-batch-files.ts`
- `apps/api/src/modules/rofl-upload/processing/execute-python-parser.ts`
- `apps/api/src/modules/rofl-upload/processing/transform-parser-json.ts`

---

## 2. Spooling Directo a Disco y Contrapresión de Red (Backpressure)

Para evitar desbordamientos de memoria en el runtime de Node.js al recibir repeticiones pesadas de varios megabytes:

1. **Aislamiento en Disco Temporal:**
   Al iniciarse la subida (`type: 'start'`), el gateway crea un subdirectorio exclusivo en el directorio temporal del sistema operativo:
   `sessionDir = path.join(os.tmpdir(), 'rcl-ws-upload-' + crypto.randomUUID())` (`rofl-upload.gateway.ts:243`).
2. **Streaming por Chunks con Detección de Drenaje:**
   A medida que llegan los fragmentos binarios por WebSocket, se escriben en un flujo físico (`fsSync.createWriteStream`). Si el búfer del sistema de archivos se llena (`canWrite === false`), el gateway pausa la recepción de tramas del socket para impedir saturar la RAM y la reanuda cuando el kernel drena los datos al disco (`rofl-upload.gateway.ts:201-207`):
   ```typescript
   const canWrite = fileWriteStream.write(buffer);
   if (!canWrite) {
     ws.pause();
     fileWriteStream.once('drain', () => {
       ws.resume();
     });
   }
   ```

---

## 3. Cola de Descompresión FIFO (`DecompressionQueue`)

La descompresión de archivos `.zip` requiere un control estricto de concurrencia para evitar picos simultáneos de uso de CPU y disco cuando múltiples administradores operan en el portal.

La clase `DecompressionQueue` (`process-batch-files.ts:19-110`) implementa un patrón de sincronización con concurrencia unitaria ($N=1$):
- **Adquisición Asíncrona:** Si la cola está libre (`!this.isRunning`), la tarea adquiere el cerrojo de inmediato. Si hay otra descompresión en curso, la solicitud se añade a una cola FIFO (`this.queue.push(...)`) y retorna una promesa diferida (`process-batch-files.ts:48-82`).
- **Notificación en Tiempo Real:** En cada cambio en la cola, `notifyWaiters()` calcula la posición ordinal del cliente y el total en espera (`pos = activeCount + index + 1`), emitiendo un evento `{ type: 'queue', position, total }` hacia la interfaz web (`process-batch-files.ts:29-38`).
- **Cancelación Limpia con `AbortSignal`:** Si el cliente se desconecta o cierra la ventana del navegador mientras espera en cola, el listener del evento `abort` purga la entrada de la lista y re-notifica a los demás clientes sin dejar promesas huérfanas ni fugas de memoria (`process-batch-files.ts:66-77`).

> [!NOTE]
> **Comportamiento Específico:** Los archivos `.rofl` individuales **no entran en la cola de descompresión**. Si el archivo subido termina en `.rofl`, la función `processBatchFiles` omite por completo `decompressionQueue.acquire()` y procede a copiar directamente el archivo en el directorio temporal de trabajo (`process-batch-files.ts:198-209`).

---

## 4. Defensas contra Ataques de Descompresión

### 4.1 Prevención de Path Traversal (*Zip Slip*)
Para neutralizar intentos de sobrescribir archivos del sistema o escapar de la partición temporal mediante nombres de archivo maliciosos como `../../../../etc/passwd`:
```typescript
// apps/api/src/modules/rofl-upload/processing/process-batch-files.ts:152-166
export function validateZipSlip(baseDir: string, entryPath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, entryPath);
  const relative = path.relative(resolvedBase, resolvedTarget);

  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    throw new RoflUploadDomainError(
      `Zip slip security violation: path traversal detected in entry '${entryPath}'`
    );
  }

  return resolvedTarget;
}
```

### 4.2 Mitigación de Bombas de Descompresión (*Zip Bombs*)
Antes de extraer el contenido a disco, el módulo inspecciona los encabezados del archivo comprimido (`process-batch-files.ts:218-254`) y aplica 4 filtros de seguridad:

| Regla / Cota | Límite Máximo | Motivo de Seguridad |
|---|:---:|---|
| **Número de partidas ROFL** | `MAX_FILES = 10` | Evita ataques de denegación de servicio por exceso de subprocesos (`process-batch-files.ts:218, 227-231`). |
| **Tamaño descomprimido por archivo** | `50 * 1024 * 1024` (50 MB) | Impide que una sola repetición manipulada colapse la partición de `/tmp` (`process-batch-files.ts:219, 238-242`). |
| **Volumen total descomprimido del lote** | `300 * 1024 * 1024` (300 MB) | Acota el tamaño total proyectado de la suma de todas las entradas del ZIP (`process-batch-files.ts:220, 251-253`). |
| **Ratio de compresión máximo** | `100:1` (`MAX_COMPRESSION_RATIO = 100`) | Detecta patrones altamente repetitivos característicos de bombas de compresión recursivas (`process-batch-files.ts:221, 244-248`). |

---

## 5. Orquestación del Subproceso Parser (`execute-python-parser.ts`)

Una vez validados los archivos `.rofl` en disco, se ejecuta el script de extracción mediante un grupo de trabajadores asíncronos controlados (`execute-python-parser.ts:89-151`):
1. **Puntero Compartido:** Los trabajadores extraen índices de un puntero compartido `currentIndex++` para equilibrar dinámicamente la carga de trabajo entre los núcleos disponibles.
2. **Contención de CPU:** Limitado estrictamente a `MAX_PARSER_CONCURRENCY = os.availableParallelism() - 1` (`execute-python-parser.ts:12-15`).
3. **Temporizador y Búfer:** `timeout: 45000` (45 segundos) y `maxBuffer: 10 * 1024 * 1024` (10 MB).
4. **Verificación $1:1$ de Salidas:** `validateParserFileCounts(validRoflCount, validJsonFiles.length)` comprueba que la cantidad de archivos JSON generados coincida exactamente con la cantidad de repeticiones ROFL válidas procesadas (`execute-python-parser.ts:34-40, 162`).

---

## 6. Ordenación Cronológica de Partidas (`transform-parser-json.ts`)

En competiciones deportivas oficiales, las series de partidas (al mejor de 3 o 5) deben guardarse en la base de datos respetando su estricto orden de juego para que el cómputo de marcadores acumulados y la numeración `game_number` sean rigurosamente fieles a la realidad.

La función `sortGamesChronologically()` (`transform-parser-json.ts:211-225`) aplica un criterio de ordenación en dos niveles:
1. **Fecha de Creación de Partida:** Si los metadatos contienen la marca de tiempo `gameCreation`, se ordenan cronológicamente de forma ascendente.
2. **Comparación Alfanumérica Natural:** Si no hay marcas temporales precisas, se utiliza comparación natural sobre el nombre del archivo:
   ```typescript
   // transform-parser-json.ts:221-223
   return a.fileName.localeCompare(b.fileName, undefined, {
     numeric: true,
     sensitivity: 'base'
   });
   ```
   Esto asegura que nombres como `partida_1.rofl`, `partida_2.rofl`, `partida_10.rofl` se ordenen matemáticamente (1, 2, 10) y no lexicográficamente (1, 10, 2).
