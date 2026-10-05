# Parser de Repeticiones ROFL (`apps/parser`)

Herramienta en Python para la extracción, decodificación y normalización de metadatos y estadísticas avanzadas a partir de archivos de repetición de League of Legends (`.rofl`).

---

## Descripción Técnica

El módulo `roflParser.py` procesa directamente los ficheros de repetición binarios generados por el cliente de League of Legends mediante un motor de acceso streaming de bajo consumo de memoria:
1. **Validación de Cabecera**: Inspecciona los primeros 4 bytes del archivo binario asegurando la coincidencia con la firma mágica `b"RIOT"`.
2. **Lectura por Seek Inverso**: Salta directamente al final del archivo (`f.seek(-4, os.SEEK_END)`) para desempaquetar la longitud en bytes del bloque de metadatos (`struct.unpack("<I", tail)[0]`), validando cotas de seguridad (`MAX_METADATA_SIZE = 10 * 1024 * 1024`).
3. **Streaming de Payload**: Salta exactamente al inicio del bloque de metadatos (`f.seek(-4 - n, os.SEEK_END)`) y transfiere a memoria únicamente los bytes del JSON (`~100 KB`), reduciendo la huella de memoria en más de un 99% y evitando riesgos de Out-Of-Memory en procesos por lotes.
4. **Normalización y Mapeo**: Deserializa el payload JSON (`statsJson`) y estructura la información de la partida (duración, versión, equipo ganador), agregados colectivos (equipos 100 y 200) y las 75 métricas canónicas individuales de los 10 jugadores:
   - Identificación de invocador: nombre, tag, riot_id, PUUID.
   - Rendimiento individual: KDA (kills, deaths, assists), multikills, rachas, súbditos (CS), oro y nivel.
   - Daño y mitigación: daño a campeones, daño recibido, daño mitigado, control de adversarios (CC).
   - Visión: puntuación de visión, wards colocados/destruidos, pink wards y detectores.
   - Estructuras y objetivos neutrales: torres, inhibidores, dragones, barones, heraldos, larvas del vacío (void grubs) y robos de objetivos.
   - Runas y objetos: árbol primario, keystone, runas secundarias, fragmentos adaptativos, slots de inventario (7 posiciones) y hechizos de invocador (con contadores de uso `casts_1` / `casts_2`).
   - Resultado: extrae y reporta el valor del campo `resultado` (`"Win"` o `"Lose"`) directamente a partir de la propiedad booleana `WIN` de cada jugador.
5. **Generación de Reporte**: Guarda un archivo JSON formateado con indentación (`indent=2`, `ensure_ascii=False`) listo para su análisis o inserción relacional.

---

## Requisitos de Ejecución

* **Python 3.10 o superior** (validado en Python 3.14).
* **Sin dependencias externas**: Es un script autónomo que utiliza exclusivamente la biblioteca estándar de Python (`sys`, `os`, `json`, `struct`, `argparse`, `typing`, `unittest`). No requiere instalar paquetes adicionales con `pip`.

---

## Modo de Uso CLI

Desde el directorio `apps/parser/` (o especificando rutas relativas/absolutas):

```bash
# Ver opciones y sintaxis disponible
python roflParser.py -h

# Extracción estándar (genera data/RCL-FIXTURE-0001_estadisticas.json)
python roflParser.py data/RCL-FIXTURE-0001.rofl

# Especificar ruta personalizada de salida (-o / --output)
python roflParser.py data/RCL-FIXTURE-0001.rofl -o /tmp/salida_estadisticas.json

# Modo silencioso para scripts de automatización (-q / --quiet)
python roflParser.py data/RCL-FIXTURE-0001.rofl -o /tmp/salida.json -q
```

El script toma por defecto el nombre y ubicación del archivo `.rofl` proporcionado y añade el sufijo `_estadisticas.json`, salvo que se suministre `-o / --output`.

---

## Uso Programático desde Python

El parser expone una API tipada y modular para integrarse directamente en workers y servicios backend sin lanzar subprocesos de shell:

```python
from apps.parser.roflParser import parse_rofl

# Extracción básica con guardado automático en <base>_estadisticas.json
data = parse_rofl("apps/parser/data/RCL-FIXTURE-0001.rofl")
print(data["partida"]["equipo_ganador"])  # 100

# Extracción con ruta personalizada y supresión de stdout
data = parse_rofl(
    "apps/parser/data/RCL-FIXTURE-0001.rofl",
    output_path="/tmp/partida.json",
    quiet=True,
)
```

---

## Pruebas Unitarias Automatizadas

El subsistema incluye una suite completa de pruebas unitarias bajo `unittest`:

```bash
# Ejecución directa desde apps/parser/tests/
python -m unittest test_roflParser.py

# Descubrimiento desde la raíz del proyecto RCL-Next
python3 -m unittest discover -s apps/parser/tests -p "test_*.py"
```

La batería de pruebas comprueba la existencia de fixtures, la fidelidad de campos de los 10 jugadores, el rechazo de archivos sin cabecera `b"RIOT"`, la validación de cotas numéricas y el comportamiento de la CLI. También verifica que el fixture solo contenga identidades ficticias.

### Fixture de pruebas anonimizado

`data/RCL-FIXTURE-0001.rofl` es una repetición sintética de unos 100 KB. Conserva únicamente lo que lee el parser: la firma `b"RIOT"`, el bloque JSON de metadatos (`gameLength`, `lastGameChunkId`, `lastKeyFrameId` y `statsJson` con los 10 participantes) y el trailer de 4 bytes con su longitud. No incluye los bloques de paquetes de red de una repetición del cliente.

Las estadísticas de juego (campeones, KDA, oro, runas, objetos, hechizos, etc.) proceden de una partida real; todos los identificadores de jugador se han sustituido por valores ficticios:

| Campo de `statsJson` | Valor en el fixture |
|---|---|
| `RIOT_ID_GAME_NAME` | `Anon Azul 1`…`Anon Azul 5` (equipo 100) y `Anon Rojo 1`…`Anon Rojo 5` (equipo 200) |
| `RIOT_ID_TAG_LINE` | `ANON` |
| `PUUID` | `00000000-0000-4000-8000-000000000001`…`00000000-0000-4000-8000-000000000010` |
| `SUMMONER_ID` e `ID` | `1`…`10` |

El nombre del archivo tampoco corresponde a ningún identificador de partida de Riot; la API deriva de él el `externalGameId` (`RCL-FIXTURE-0001`). `result/RCL-FIXTURE-0001_estadisticas.json` es la salida del parser sobre este archivo y la prueba `test_parse_fixture_rofl` exige que coincidan. No se deben añadir repeticiones reales al repositorio: si hace falta un caso nuevo, se anonimizan los campos anteriores y se regenera el JSON esperado con `python roflParser.py data/<archivo>.rofl -o result/<archivo>_estadisticas.json`.

---

## Estructura de Directorios

```text
apps/parser/
├── roflParser.py           # Motor extractor principal y CLI en Python
├── README.md               # Documentación e instrucciones de uso
├── tests/                  # Suite de pruebas unitarias (unittest)
│   └── test_roflParser.py
├── data/                   # Archivos .rofl de entrada
│   └── RCL-FIXTURE-0001.rofl
└── result/                 # Reportes generados en formato JSON
    └── RCL-FIXTURE-0001_estadisticas.json
```

---

## Documentación Arquitectónica Relacionada

* [**Arquitectura y Motor del Parser ROFL**](../../docs/architecture/rofl-parser.md): Formato binario, algoritmo de seek inverso, benchmarking de memoria y especificación de seguridad.
* [**Mapeo hacia la Base de Datos**](../../docs/architecture/rofl-mapping.md): Correspondencia exacta entre cada campo del JSON y las columnas de las tablas relacionales (`player_game_info`, `player_game_stats`, `player_game_runes`, `player_game_build`).
