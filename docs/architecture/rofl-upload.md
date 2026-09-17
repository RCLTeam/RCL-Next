# Arquitectura de Ingesta ROFL

Este documento detalla el diseño técnico del sistema de carga y procesamiento de repeticiones de League of Legends (archivos `.rofl`), implementado a lo largo del stack de la aplicación.

## Pipeline de Ingesta Multi-nivel

La importación y procesamiento se estructura en una cadena de responsabilidades estrictamente secuencial y altamente resiliente:

1. **WebSocket Gateway y Streaming Directo a Disco**
   - La subida se orquesta a través de una conexión persistente vía WebSocket en `/ws/rofl-upload`.
   - Los archivos se escriben directamente a disco mediante streaming binario puro sin cargar el archivo completo en memoria.
   - El control de contrapresión (backpressure) pausa la recepción del socket si el buffer del sistema de archivos se satura, previniendo cuellos de botella y agotamiento de memoria.

2. **Cola FIFO de Descompresión Segura**
   - La extracción (descompresión) opera sobre una cola en memoria con concurrencia máxima de 1 (`concurrency = 1`), mitigando picos de latencia en la infraestructura.
   - Prevención activa de Zip-Slip: Se validan rigurosamente las rutas de descompresión para prevenir la escritura de archivos fuera del directorio de destino designado.

3. **Puente Dinámico al Parser de Python**
   - El análisis del formato binario ROFL se delega a `roflParser.py`.
   - El despacho del parser se escala dinámicamente limitando el consumo a `cores - 1` (con un mínimo asegurado de 1 proceso concurrente).
   - Resiliencia de cabeceras: Si el archivo extraído no es un ROFL legítimo (no inicia con el encabezado `b"RIOT"`), el parser devuelve el código de salida POSIX 11. El orquestador intercepta este código, emite una advertencia de salto (skip) y continúa procesando el lote sin detener la ejecución de otros archivos válidos.

4. **Caché en Memoria de Validación de Participantes**
   - Se emplea una estrategia fail-fast que precarga e indexa en memoria las plantillas de los equipos y las cuentas vinculadas.
   - Cualquier invocador no registrado en un roster es rechazado de inmediato antes de iniciar transacciones costosas.

5. **Detección de Anomalías de Múltiples Cuentas (Smurfing/Compartición)**
   - El sistema de validación audita la presencia de un mismo usuario físico (identificado por su `discord_user_id`) jugando simultáneamente con más de una cuenta vinculada en la misma partida, levantando una alerta de anomalía de integridad competitiva.

6. **Persistencia Atómica PostgreSQL y Lógica de Negocio**
   - Transaccionalidad 1:5 garantizada para las tablas: `match_games`, `player_game_info`, `player_game_stats`, `player_game_runes`, y `player_game_build`.
   - Regla estricta de incomparecencia (forfeit): Se requiere la alineación exacta de 5 jugadores por equipo en la partida (10 jugadores totales). Equipos incompletos descalifican la inserción.
   - Matching elástico de jornada semanal: La asociación de la partida a una jornada específica emplea una ventana de calendario tolerante que abarca desde el domingo a las 00:00 UTC hasta el lunes a las 23:59 UTC, asimilando desfases de programación y zonas horarias locales.
   - Idempotencia: Los intentos de carga duplicados se descartan con seguridad utilizando la unicidad del `external_game_id`.
   - Progresión de la serie: La persistencia desencadena automáticamente el recálculo y avance del marcador global de la serie (`matches`), así como la reevaluación de los pronósticos vinculados.

## Arquitectura de Consola Frontend (React 19)

La interfaz de usuario en `apps/web/` proporciona el cliente para la gestión de las cargas y telemetría en tiempo real.

- **Máquina de Estado de Conexión (`useRoflUploadWs`)**
  - Un hook dedicado gestiona los estados de conectividad, autorización implícita, interrupciones de red, y reconexiones al WebSocket.
- **Fragmentación y Control de Flujo (Chunking)**
  - Los archivos `.zip` o `.rofl` se dividen en el cliente utilizando la API `Blob.slice()` en fragmentos uniformes (64 KB).
  - El bucle de transmisión aplica un estrangulamiento adaptativo basado en `socket.bufferedAmount` para no saturar la red local o el buffer del navegador.
- **Componentes de Interfaz**
  - **Dropzone:** Zona de arrastrar y soltar que inspecciona la validez del archivo local.
  - **Stepper:** Barra de progreso multipasos en tiempo real que refleja el estado semántico de procesamiento en el backend (descompresión, análisis, validación, persistencia).
  - **Visor de Telemetría (Live Terminal):** Consola virtual que renderiza con debounce y throttle los registros de eventos de progreso, advertencias, e inserciones, optimizando los ciclos de renderizado de React 19 durante flujos densos de información.
