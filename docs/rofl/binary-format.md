# Formato Binario ROFL y Estructura de Metadatos

[⬅️ Volver a ROFL Pipeline](README.md) | [Siguiente: Diccionario de Mapeo ➡️](mapping.md)

---

## 1. Visión General del Formato

Los archivos con extensión `.rofl` (*Riot Official File Lock*) constituyen el formato binario propietario generado por el cliente de League of Legends para el almacenamiento y reproducción de partidas grabadas.

Un archivo de repetición típico oscila entre 10 MB y 60 MB de peso físico. No obstante, más del 99% de su contenido está compuesto por paquetes cifrados y comprimidos de simulación de juego (*keyframes* y *chunks* de red de redifusión de ticks del servidor).

El diseño de RCL-Next ignora el cuerpo de simulación y se enfoca con precisión quirúrgica en el **bloque de metadatos JSON** incrustado al final del archivo por Riot Games al finalizar la partida.

---

## 2. Diagrama de Distribución Binaria

```
┌────────────────────────────────────────────────────────────────────────┐
│ Byte 0 .. 3                                                            │
│ Cabecera Mágica: b"RIOT" (4 bytes ASCII)                               │
├────────────────────────────────────────────────────────────────────────┤
│ Byte 4 .. (TotalSize - N - 4)                                          │
│ Datos de Simulación de Partida (Chunks de red, keyframes, eventos)     │
│ [OMITIDO COMPLETAMENTE POR EL PARSER DE RCL-NEXT]                      │
├────────────────────────────────────────────────────────────────────────┤
│ Byte (TotalSize - N - 4) .. (TotalSize - 4)                            │
│ Bloque de Metadatos JSON (N bytes en formato UTF-8)                    │
│ Contiene: gameLength, lastGameChunkId, lastKeyFrameId, statsJson...    │
├────────────────────────────────────────────────────────────────────────┤
│ Byte (TotalSize - 4) .. (TotalSize)                                    │
│ Trailer de Longitud: Entero 32 bits Little-Endian (<I) (4 bytes)       │
│ Indica el valor exacto de N (longitud de bytes de la metadata)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Algoritmo de Extracción Forense

La lectura del archivo está encapsulada en la función `read_rofl()` (`apps/parser/roflParser.py:80-123`):

### 3.1 Comprobación de Cabecera Mágica
- **Offset:** `0` (primeros 4 bytes).
- **Firma esperada:** `b"RIOT"` (`MAGIC_HEADER`, `roflParser.py:12`).
- **Verificación:** `f.read(4)`. Si no coincide, se interrumpe de inmediato con `InvalidMagicHeaderError` (código de salida `11`, `roflParser.py:83-87`).

### 3.2 Seek Inverso y Desempaque Little-Endian
1. **Medición del archivo:** Se salta al final con `f.seek(0, os.SEEK_END)` y se obtiene la longitud total mediante `total_size = f.tell()` (`roflParser.py:89-90`).
2. **Extracción del trailer:** Se posiciona el puntero en los últimos 4 bytes con `f.seek(-4, os.SEEK_END)` y se leen los 4 bytes finales (`tail = f.read(4)`, `roflParser.py:94-95`).
3. **Unpack numérico:** Se decodifica mediante `struct.unpack("<I", tail)` (`roflParser.py:99`).
   - `<`: Formato de ordenamiento de bytes little-endian.
   - `I`: Entero sin signo de 32 bits (`unsigned int`).
   - El resultado $n$ representa la cantidad exacta de bytes que ocupa el bloque de metadatos.

### 3.3 Validación de Integridad de la Carga Útil
Antes de leer el payload, se evalúan 3 cotas de seguridad:
- $n \le 0$ o $n > \text{MAX\_METADATA\_SIZE}$ ($10\text{ MB} = 10 \times 1024 \times 1024\text{ bytes}$): previene asignaciones masivas descontroladas de memoria (`roflParser.py:100-101`).
- `total_size < 4 + n + 4`: garantiza que el archivo sea físicamente capaz de albergar la cabecera (4 bytes), la carga útil ($n$ bytes) y el trailer (4 bytes) (`roflParser.py:103-104`).

### 3.4 Localización del Payload
El puntero de lectura se reubica exactamente en el byte inicial de la metadata:
```python
# apps/parser/roflParser.py:106-107
f.seek(-4 - n, os.SEEK_END)
payload = f.read(n)
```

---

## 4. Deserialización y `statsJson` Doblemente Serializado

El bloque leído se decodifica como texto UTF-8 (`payload.decode("utf-8")`) y se procesa en dos capas JSON (`roflParser.py:114-115, 303-314`):

1. **JSON Primario (Contenedor de Repetición):**
   Un diccionario con claves de nivel superior:
   ```json
   {
     "gameLength": 1845123,
     "lastGameChunkId": 58,
     "lastKeyFrameId": 19,
     "statsJson": "[{\"NAME\":\"Faker\",\"CHAMPIONS_KILLED\":\"5\",...}]"
   }
   ```
2. **JSON Secundario (`statsJson`):**
   El valor de la clave `statsJson` no es un objeto JSON nativo dentro del contenedor primario, sino una **cadena de texto escapada y serializada por segunda vez** (`json.loads(stats_json_str)` en `roflParser.py:308`).
   Una vez deserializado, contiene un array de diccionarios, donde cada elemento almacena los atributos planos y métricas de final de partida de un jugador en la Grieta del Invocador (típicamente 10 participantes).

---

## 5. Delimitaciones y Ausencias en Metadatos

Conforme a la estructura del archivo y el código del parser:

> [!WARNING]
> ### Ausencia de Línea Temporal (Timeline) y Eventos en Vivo
> El bloque de metadatos del archivo `.rofl` **NO CONTIENE eventos temporales minuto a minuto, ni coordenadas geográficas en el mapa, ni orden secuencial de compra de objetos, ni evento de *First Blood*** (`roflParser.py:383-390`).
>
> 1. **Cero Línea Temporal en Metadata:** Riot Games no incluye la cronología de eventos en `statsJson`. Toda la información presente es una **instantánea acumulativa (*end-game snapshot*)** del estado final de la partida al explotar el nexo.
> 2. **Cero Invención de Datos:** El parser de RCL-Next declara explícitamente en el campo `"nota"` (`roflParser.py:383-389`) que estos campos no se inventan ni se infieren heurísticamente.
> 3. **Resolución Externa de IDs Numéricos:** Los identificadores de campeones (`SKIN`), objetos (`ITEM0..6`), runas (`PERK0..5`) y hechizos (`SUMMONER_SPELL_1..2`) son enteros brutos que no contienen nombres descriptivos en el `.rofl`. Su resolución a nombres humanos e iconos gráficos depende de diccionarios estáticos o de la CDN de **Data Dragon** en el frontend.
