# Parser de Repeticiones ROFL (`apps/parser`)

Herramienta en Python para la extracción, decodificación y normalización de metadatos y estadísticas avanzadas a partir de archivos de repetición de League of Legends (`.rofl`).

---

## Descripción Técnica

El script `roflParser.py` procesa directamente los ficheros de repetición binarios generados por el cliente de League of Legends:
1. Inspecciona los bytes finales del archivo binario `.rofl` para desempaquetar la longitud del bloque de metadatos (`struct.unpack("<I", data[-4:])[0]`).
2. Extrae y decodifica el payload JSON incrustado por Riot Games.
3. Estructura y normaliza la información de la partida (duración, versión, equipo ganador), resumen de equipos y métricas individuales de los 10 jugadores:
   - Identificación de invocador: nombre, tag, riot_id, PUUID.
   - Rendimiento individual: KDA (kills, deaths, assists), multikills, rachas, súbditos (CS), oro y nivel.
   - Daño y mitigación: daño a campeones, daño recibido, daño mitigado, control de adversarios (CC).
   - Visión: puntuación de visión, wards colocados/destruidos, pink wards y detectores.
   - Estructuras y objetivos neutrales: torres, inhibidores, dragones, barones, heraldos, larvas del vacío (void grubs) y robos de objetivos.
   - Runas y objetos: árbol primario, keystone, runas secundarias, fragmentos adaptativos, slots de inventario y hechizos de invocador (con contadores de uso `casts_1` / `casts_2`).
   - Resultado: extrae y reporta el valor del campo `resultado` (`"Win"` o `"Lose"`) directamente a partir de la propiedad booleana `WIN` de cada jugador.
4. Genera un archivo JSON formateado con sufijo `_estadisticas.json` listo para análisis o volcado en la base de datos de la liga.

---

## Requisitos de Ejecución

* **Python 3.10 o superior**.
* **Sin dependencias externas**: Es un script autónomo que utiliza exclusivamente la biblioteca estándar de Python (`sys`, `os`, `json`, `struct`). No requiere instalar paquetes adicionales con `pip`.

---

## Modo de Uso CLI

Desde el directorio `apps/parser/` (o especificando rutas relativas/absolutas):

```bash
python roflParser.py <ruta_del_archivo.rofl>
```

### Ejemplo de Ejecución

```bash
# Estando en apps/parser/:
python roflParser.py data/EUW1-7982902321.rofl

# Salida generada:
# Se creará el archivo data/EUW1-7982902321_estadisticas.json
```

El script toma como base el nombre y ubicación del archivo `.rofl` proporcionado y añade el sufijo `_estadisticas.json`.

---

## Estructura de Directorios

```text
apps/parser/
├── roflParser.py           # Script extractor principal en Python
├── README.md               # Documentación e instrucciones de uso
├── data/                   # Directorio de archivos .rofl de entrada
│   └── EUW1-7982902321.rofl
└── result/                 # Directorio donde se generan los reportes JSON
    └── EUW1-7982902321_estadisticas.json
```

* **`apps/parser/data/`**: Directorio de archivos `.rofl` de entrada (ej. `EUW1-7982902321.rofl`).
* **`apps/parser/result/`**: Directorio donde se generan los reportes JSON (ej. `EUW1-7982902321_estadisticas.json`), utilizados tanto como artefactos de prueba para el esquema relacional (`tests/unit/database/roflStats.test.ts`) como fuente para la futura ingesta de partidos.

---

## Mapeo hacia la Base de Datos

Para consultar la correspondencia exacta entre cada campo del JSON producido por `roflParser.py` y las columnas del esquema PostgreSQL (`player_game_info`, `player_game_stats`, `player_game_runes`, `player_game_build`), consulta [`docs/architecture/rofl-mapping.md`](../../docs/architecture/rofl-mapping.md).
