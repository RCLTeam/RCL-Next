# Arquitectura del Extractor de Repeticiones ROFL (`roflParser`)

El subsistema `apps/parser` proporciona la infraestructura de análisis binario, extracción de metadatos y normalización de estadísticas a partir de archivos de repetición (`.rofl`) generados por el cliente de League of Legends.

Para consultar el diseño de entidades, diagramas y operaciones de base de datos relacionadas:
- [**Mapeo de Estadísticas JSON a PostgreSQL**](rofl-mapping.md): Correspondencia entre campos del JSON generado y las tablas `player_game_info`, `player_game_stats`, `player_game_runes`, `player_game_build`.
- [**Modelo y Decisiones Arquitectónicas**](database.md): Decisiones de diseño relacional, desempate e integridad referencial.
- [**Esquema Relacional y Diagrama ER**](database-schema.md): Diagrama Mermaid ER de las 16 tablas, enums, checks y reglas de integridad.
- [**Operaciones, Concurrencia y Comandos**](database-operations.md): Bloqueos consultivos, configuración del pool y comandos CLI.

---

## 1. Formato Binario de Archivos `.rofl`

Las repeticiones de League of Legends son archivos empaquetados en un formato binario propietario de Riot Games compuesto por bloques de paquetes de red, keyframes de reconstrucción visual y un bloque de metadatos JSON al final del archivo:

```text
[Offset 0]
+-----------------------------------------------------------------------------------+
| Bytes 0..3: Cabecera Mágica b"RIOT" (Identificador de firma de repetición)       |
+-----------------------------------------------------------------------------------+
| Bytes 4 .. (EOF - 4 - n): Carga Binaria de Juego                                 |
| - Tabla de longitudes de chunks y keyframes                                      |
| - Paquetes de red encriptados / comprimidos                                       |
| - Datos de interpolación y renderizado                                            |
+-----------------------------------------------------------------------------------+
| Bytes (EOF - 4 - n) .. (EOF - 4): Bloque de Metadatos JSON (Exactamente n bytes) |
| - Claves raíz: gameLength, lastGameChunkId, lastKeyFrameId, statsJson             |
+-----------------------------------------------------------------------------------+
| Bytes (EOF - 4) .. EOF: Trailer uint32 Little-Endian con valor n (4 bytes)       |
+-----------------------------------------------------------------------------------+
[Offset EOF]
```

### Componentes de la Estructura:
1. **Cabecera Mágica (`b"RIOT"`)**: Ocupa exactamente los primeros 4 bytes (offset `0..3`). Permite verificar de forma inmediata si el archivo corresponde a una repetición legítima antes de realizar cualquier operación costosa.
2. **Cuerpo de Repetición**: Chunks de red y keyframes ordenados temporalmente. No contienen estadísticas acumuladas de final de partida; se utilizan exclusivamente por el motor de renderizado 3D del juego para reproducir la partida.
3. **Bloque de Metadatos JSON (`statsJson`)**: Cadena de texto JSON codificada en UTF-8 que almacena la duración (`gameLength`), identificadores de chunks (`lastGameChunkId`, `lastKeyFrameId`) y la serialización cruda de estadísticas de los participantes (`statsJson`).
4. **Trailer uint32 Little-Endian**: Entero sin signo de 32 bits (`<I`) ubicado en los últimos 4 bytes del archivo (`EOF - 4`). Su valor numérico especifica la longitud exacta en bytes ($n$) del bloque de metadatos previo.

---

## 2. Mecanismo de Extracción

A diferencia de los analizadores tradicionales que leen el archivo completo en memoria, el motor `roflParser` implementa un algoritmo de acceso directo $O(1)$ basado en **seek inverso**:

```text
Flujo de ejecución de read_rofl():

1. open(path, "rb")
   │
   ├──► 2. f.read(4) ──► ¿header == b"RIOT"? ──(No)──► raise ValueError("Cabecera ROFL no reconocida...")
   │                                                    
   ├──► 3. f.seek(0, SEEK_END) ──► total_size = f.tell() ──► ¿total_size < 8? ──► raise ValueError
   │                                                                               
   ├──► 4. f.seek(-4, SEEK_END) ──► tail = f.read(4) ──► (n,) = unpack("<I", tail)
   │                                                                               
   ├──► 5. Validar: (0 < n <= MAX_METADATA_SIZE) y (total_size >= 4 + n + 4)
   │                                                                               
   ├──► 6. f.seek(-4 - n, SEEK_END) ──► payload = f.read(n) ──► ¿len == n?
   │                                                                               
   └──► 7. json.loads(payload.decode("utf-8")) ──► meta
```

### Pasos Operativos:
1. **Verificación Perimetral**: Se leen los primeros 4 bytes (`f.read(4)`). Si no coinciden con `b"RIOT"`, la ejecución se interrumpe de inmediato levantando `ValueError`.
2. **Lectura del Trailer**: Mediante `f.seek(-4, os.SEEK_END)`, el puntero de archivo se posiciona en los últimos 4 bytes sin transferir el cuerpo binario a memoria. Se desempaqueta el entero $n$ con `struct.unpack("<I", tail)[0]`.
3. **Validación de Cotas y Seguridad**: Se verifica que $0 < n \le \text{MAX\_METADATA\_SIZE}$ (10 MB) y que el tamaño total del archivo sea superior o igual a $4 + n + 4$ bytes, evitando desbordamientos de memoria y punteros negativos fuera del archivo.
4. **Lectura Streaming del Payload**: Con `f.seek(-4 - n, os.SEEK_END)`, se salta directamente al inicio del bloque de metadatos y se leen exactamente $n$ bytes (`f.read(n)`).
5. **Decodificación y Parseo**: Se decodifica la secuencia UTF-8 y se deserializa la estructura JSON con `json.loads`.

---

## 3. Mejoras Implementadas

| Dimensión | Enfoque Previo | Implementación Actual | Beneficio Técnico |
| --- | --- | --- | --- |
| **Consumo de Memoria** | `f.read()` carga el archivo completo en RAM (~13 MB en fixture, 50–100+ MB en replays largas). | `f.seek()` inverso transfiere únicamente el bloque de metadatos (~100 KB). | **Reducción de huella de memoria del 99.2%** (~325 KB en RAM). Elimina riesgo de OOM en procesamiento masivo. |
| **Validación de Cabecera** | Solo comprobaba `len(data) < 4`; procesaba cualquier archivo binario. | Comprobación estricta de firma mágica `b"RIOT"` en offset 0. | Rechazo inmediato de archivos no compatibles, vacíos o corruptos antes de asignar memoria. |
| **Defensa Perimetral** | Sin cota superior; propenso a valores corruptos en el trailer. | Límite `MAX_METADATA_SIZE = 10 * 1024 * 1024` y validación contra `total_size`. | Prevención contra ataques DoS de memoria y llamadas inválidas al sistema de archivos. |
| **Modularidad y API** | Conflación de CLI y lógica en una función monolítica `main(path)`. | Exportación de `parse_rofl(path, output_path=None, quiet=False) -> Dict[str, Any]`. | Integración directa como biblioteca en servicios backend, workers de ingesta y tests. |
| **Tipado Estricto** | Sin anotaciones de tipo (`typing`). | Anotaciones de tipo completas (`Dict`, `List`, `Optional`, `Union`, `Tuple`, etc.). | Mantenibilidad, autocompletado y validación estática de tipos. |
| **Interfaz CLI** | Argumentos crudos `sys.argv[1]` sin opciones ni ayuda contextual. | `argparse.ArgumentParser` con argumentos `path`, `-o/--output` y `-q/--quiet`. | Cumplimiento con estándares POSIX de herramientas de línea de comandos. |
| **Pruebas Automatizadas** | Sin suite de pruebas automatizadas (0% de cobertura en Python). | Suite unitaria completa en `apps/parser/test_roflParser.py` (`unittest`). | Verificación continua de integridad binaria, esquemas y límites en < 0.01 segundos. |

---

## 4. Mapeo y Agregaciones de Datos

El bloque `meta["statsJson"]` contiene una lista de 10 diccionarios crudos de participantes con 314 claves cada uno. La función `player()` normaliza estas propiedades en una estructura de 75 claves canónicas:

### Estructura Normalizada del Participante:
* **Identidad y Rol**: `nombre`, `tag`, `riot_id` (`nombre#tag`), `puuid`, `campeon`, `posicion` (resuelto por jerarquía `INDIVIDUAL_POSITION` → `TEAM_POSITION` → `PLAYER_POSITION` → `PLAYER_ROLE`), `equipo` (100 azul / 200 rojo), `resultado` (`"Win"` o `"Lose"` derivado de la propiedad booleana `WIN`).
* **KDA y Desempeño**: `kills`, `muertes`, `asistencias`, `double_kills`, `triple_kills`, `quadra_kills`, `penta_kills`, `largest_killing_spree`.
* **Economía y Ritmo**: `oro`, `cs` (`MINIONS_KILLED + NEUTRAL_MINIONS_KILLED`), `nivel`, `daño_campeones`, `daño_recibido_campeones`, `pings`.
* **Soporte y Control**: `daño_mitigado`, `control_adversarios`.
* **Estructuras**: `torres`, `derribos_torres`, `inhibidores`, `derribos_inhibidores`.
* **Visión**: `score`, `wards_colocados`, `wards_destruidos`, `pinkwards_comprados`, `wards_detector`.
* **Runas (`runas`)**:
  - `primaria`: `estilo_id`, `keystone_id`, `runa_1_id`, `runa_2_id`, `runa_3_id`.
  - `secundaria`: `estilo_id`, `runa_1_id`, `runa_2_id`.
  - `fragmentos`: `ofensiva_id`, `flexible_id`, `defensiva_id`.
* **Inventario (`objetos`)**: Array fijo de 7 posiciones con claves `slot` (0..6) e `id`.
* **Hechizos (`hechizos`)**: `hechizo_1_id`, `hechizo_2_id`, `casts_1`, `casts_2`.
* **Monstruos Épicos (`monstruos`)**: `dragones`, `barones`, `heraldos`, `void_grubs`, `elder_dragons`, `objetivos_robados`, `asistencias_robo`.
* **Gameplay Avanzado**: `mayor_daño_habilidad`, `mayor_daño_ataque`, `mayor_critico`, `tiempo_vivo_mas_largo`, `tiempo_muerto`.

### Agregaciones de Equipo:
La función `team(team_id, ps)` calcula de forma aditiva las métricas colectivas de cada bando:
- `resumen`: suma total de kills, muertes, asistencias, oro total, daño infligido y recibido.
- `objetivos`: suma de dragones, barones, heraldos, void grubs, dragones ancianos e inhibidores destruidos.
- `victoria`: booleano determinado por la presencia de `resultado == "Win"` entre los integrantes del equipo.
- `jugadores`: lista ordenada de identidades `riot_id`.

---

## 5. Guía de Uso

### 5.1. Uso desde Línea de Comandos (CLI)

```bash
# Ayuda y opciones
python3 apps/parser/roflParser.py -h

# Extracción estándar (genera data/EUW1-7982902321_estadisticas.json)
python3 apps/parser/roflParser.py apps/parser/data/EUW1-7982902321.rofl

# Especificar ruta personalizada de salida (-o / --output)
python3 apps/parser/roflParser.py apps/parser/data/EUW1-7982902321.rofl -o /tmp/partida_analizada.json

# Modo silencioso para scripts de automatización (-q / --quiet)
python3 apps/parser/roflParser.py apps/parser/data/EUW1-7982902321.rofl -o /tmp/partida.json -q
```

### 5.2. Uso Programático en Python

```python
from apps.parser.roflParser import parse_rofl

# Parseo y guardado por defecto
datos = parse_rofl("apps/parser/data/EUW1-7982902321.rofl")
print(f"Duración: {datos['partida']['duracion_formateada']}")
print(f"Equipo ganador: {datos['partida']['equipo_ganador']}")
print(f"Total jugadores: {len(datos['jugadores'])}")

# Parseo con ruta personalizada en modo silencioso
datos = parse_rofl(
    "apps/parser/data/EUW1-7982902321.rofl",
    output_path="var/reports/partida.json",
    quiet=True,
)
```

### 5.3. Ejecución de la Suite de Pruebas Unitarias

```bash
# Descubrimiento automático de todas las pruebas en apps/parser/
python3 -m unittest discover -s apps/parser -p "test_*.py"

# Ejecución directa del archivo de test
python3 -m unittest apps/parser/test_roflParser.py
```
