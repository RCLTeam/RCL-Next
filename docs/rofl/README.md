# Pipeline de Procesamiento y Formato Binario ROFL

[⬅️ Volver al Índice Principal de Documentación](../README.md) | [Siguiente: API ROFL Upload ➡️](../api/rofl-upload/README.md)

---

## 1. Resumen Ejecutivo

El subsistema de procesamiento ROFL (*Riot Official File Lock / Replay*) de RCL-Next es el motor de bajo nivel responsable de ingerir, validar, desempaquetar y analizar archivos de repetición binarios generados por el cliente de League of Legends. Su diseño prioriza la eficiencia extrema de memoria y la velocidad de ejecución mediante un algoritmo de lectura de metadatos de **seek inverso $O(1)$** implementado en Python 3 (`apps/parser/roflParser.py`), el cual prescinde por completo de descomprimir o procesar el flujo pesado de paquetes de red de simulación de juego (10 a 50 MB) y lee directamente la estructura final de metadatos (~100 KB).

El pipeline garantiza un aislamiento riguroso entre la capa de ejecución nativa en Python y el backend en Node.js, operando con orquestación paralela delimitada por núcleos físicos (`os.availableParallelism() - 1`), buffers acotados (10 MB), tiempos de espera estrictos (45s) y códigos de salida terminales diferenciados (0 a 14).

Posteriormente, las estadísticas extraídas se transforman y mapean de manera normalizada sobre el esquema relacional de 5 tablas de PostgreSQL gestionado con Drizzle ORM, asegurando coherencia transaccional e integridad histórica de cada partida.

### Persistencia del MVP al completar una serie

Cuando una subida alcanza el umbral de victorias de un Bo1, Bo3 o Bo5, el repositorio calcula el MVP con todos los mapas almacenados del enfrentamiento, incluidos los de subidas anteriores. Utiliza la posición de cada replay, el oro y las demás métricas persistidas, sin consultar roles de plantilla para el cálculo.

El resultado se guarda en `matches.mvp_player_id` y `matches.mvp_score` dentro de la misma transacción que inserta las estadísticas y marca la serie como completada. El bloqueo `FOR UPDATE` del enfrentamiento protege esta operación frente a subidas concurrentes. Si no hay candidato elegible o falla la escritura del MVP, se revierte el lote completo.

Las series abiertas no reciben un MVP anticipado. Los reintentos de archivos duplicados y los intentos de subir mapas a una serie cerrada conservan el resultado. Incluso si se reabre administrativamente una serie, la subida no reemplaza ninguno de los campos de MVP cuando ya existe algún valor; esto también conserva la puntuación si el jugador fue eliminado y la clave foránea quedó en `NULL`.

Este flujo solo sella nuevas finalizaciones. El backfill histórico y la lectura de estos campos desde los endpoints se implementan por separado.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Motor de Parsing y CLI** | [parser.md](parser.md) | Especificación técnica de `roflParser.py`, interfaz de línea de comandos, códigos de salida (0-14), cuotas de metadatos, paralelismo en subprocesos y ordenación natural determinista de partidas importadas (`orderImportedGames`) con Three-Way Swap atómico en PostgreSQL. |
| **Estructura Binaria ROFL** | [binary-format.md](binary-format.md) | Anatomía física del archivo `.rofl`, cabecera mágica `b"RIOT"`, trailer little-endian de 4 bytes, `statsJson` doblemente codificado y delimitaciones técnicas en metadatos. |
| **Diccionario de Mapeo Relacional** | [mapping.md](mapping.md) | Mapeo detallado de las 75 métricas de invocador y equipo de `statsJson` hacia las 5 tablas Drizzle (`match_games`, `player_game_info`, `player_game_stats`, `player_game_runes`, `player_game_build`), junto a la derivación y redirección obligatoria de cuentas secundarias / smurfs hacia la cuenta principal física (`findPlayersByRiotIds`). |

---

## 3. Principios de Diseño del Parser

1. **Lectura Inversa $O(1)$:** En lugar de escanear secuencialmente los megabytes de paquetes de chunks de la partida, el parser salta directamente a los últimos 4 bytes del archivo para leer el trailer de longitud, situándose instantáneamente en el bloque JSON de metadatos.
2. **Defensas contra Archivos Truncados y Maliciosos:** Se verifica la cabecera mágica `b"RIOT"` (4 bytes), un tamaño mínimo físico de 8 bytes y una cota superior estricta de metadatos de 10 MB (`MAX_METADATA_SIZE`), arrojando códigos de error específicos ante archivos corruptos o payload bomb.
3. **Cero Dependencias Externas en Python:** `roflParser.py` opera exclusivamente con la librería estándar de Python (`struct`, `json`, `os`, `sys`, `argparse`), garantizando portabilidad instantánea sin requerir entornos virtuales ni paquetes `pip`.
4. **Tolerancia a Fallos en Lotes:** El pipeline en Node.js distingue fallos de cabecera mágica (código 11) para ignorar archivos no-ROFL dentro de paquetes ZIP sin interrumpir el procesamiento de las partidas válidas del lote.
