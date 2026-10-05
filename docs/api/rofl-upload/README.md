# Módulo Backend de Subida y Procesamiento ROFL

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Frontend ROFL Upload ➡️](../../../docs/web/rofl-upload/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/rofl-upload/` constituye la pasarela de procesamiento e ingesta de repeticiones en el backend de RCL-Next. Su responsabilidad abarca la recepción de archivos `.rofl` individuales y paquetes `.zip` comprimidos a través de un canal bidireccional por WebSocket (`/ws/rofl-upload`), su escritura en streaming a disco temporal bajo contrapresión de flujo, la mitigación de vectores de ataque de descompresión (*Zip Slip* y *Zip Bomb*), la orquestación paralela del parser binario y la persistencia transaccional ACID en 5 tablas de PostgreSQL.

El diseño sigue una **arquitectura en capas desacopladas (*Vertical Slice Architecture*)**:
- **Gateway WebSocket (`websocket/`):** Control de acceso por sesión, streaming binario y señalización en tiempo real.
- **Procesamiento puro (`processing/`):** Colas FIFO de descompresión, saneamiento de rutas, ejecución de subprocesos y ordenación cronológica.
- **Validación deportiva (`validation/`):** Comprobación fail-fast de invocadores registrados, unanimidad de alineaciones y detección de anomalías multi-cuenta.
- **Persistencia ACID (`persistence/`):** Bloqueo pesimista de fila, inserciones multi-fila atómicas y sincronización con disparadores diferidos.
- **Contratos tipados (`types/`):** DTOs compartidos e interfaces de dominio.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Gateway WebSocket y Rutas** | [routes.md](routes.md) | Endpoint `/ws/rofl-upload`, validación de `Origin` en el handshake (403/503), autenticación de sesión administrativa, errores de dominio frente a incidentes con `incidentId`, ciclo de vida de conexión, opcodes y cuota de 50 MB (código 1009). |
| **Pipeline de Procesamiento y Colas** | [processing.md](processing.md) | Spooling a `os.tmpdir()`, contrapresión `pause/drain`, cola de descompresión FIFO ($N=1$), defensas Zip Slip / Bomb y subprocesos. |
| **Persistencia Transaccional ACID** | [persistence.md](persistence.md) | `postgres-rofl-upload.repository.ts`, bloqueo pesimista `SELECT ... FOR UPDATE`, inserción en 5 tablas y triggers diferidos. |
| **Validaciones y Reglas Deportivas** | [validation.md](validation.md) | Validación fail-fast de participantes registrados, auditoría de rosters unánimes y detección no bloqueante de anomalías multi-cuenta. |
| **Contratos y DTOs de Integración** | [contracts.md](contracts.md) | Definición formal de contratos TypeScript (`@rcl/contracts`), eventos del servidor, mensajes del cliente y esquemas de dominio. |

---

## 3. Garantías Arquitectónicas

1. **Aislamiento de Memoria Heap:** Los chunks binarios recibidos por WebSocket nunca se almacenan en variables acumulativas de memoria en Node.js; se canalizan directamente a un `WriteStream` en disco.
2. **Defensa contra Condiciones de Carrera:** La asignación de números de partida dentro de una serie al mejor de $N$ utiliza bloqueo pesimista a nivel de fila (`FOR UPDATE`) sobre el partido padre en `matches`, garantizando que múltiples subidas simultáneas no provoquen colisiones de clave única ni desincronización de marcadores.
3. **Persistencia Todo o Nada (Atomicidad):** La serie completa se procesa dentro de una única transacción de base de datos. Si un solo invocador del lote no está registrado en el sistema, la transacción se aborta de inmediato y ningún registro parcial queda en la base de datos.
