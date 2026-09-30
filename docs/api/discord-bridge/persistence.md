# Persistencia y Gestión de Memoria del Puente Discord

[⬅️ Volver a API Discord Bridge](README.md) | [Siguiente: Validación ➡️](validation.md)

---

## 1. Visión General

El módulo `apps/api/src/modules/discord-bridge/` opera bajo una arquitectura de persistencia puramente **volátil en memoria**. No interacciona con la base de datos PostgreSQL, no genera migraciones de Drizzle ORM, ni consulta tablas relacionales del monorepo (`packages/database/src/schema.ts`).

Toda la amortiguación de peticiones, el control de concurrencia y la sincronización de estados ocurren en el heap del proceso Node.js mediante estructuras de datos estándar y ciclos de vida efímeros.

---

## 2. Ausencia de Persistencia Relacional

Una inspección forense exhaustiva de `discord-bridge.client.ts` y `discord-bridge.router.ts` certifica:
1. **Cero Importaciones de Drizzle:** Los archivos del módulo no importan la base de datos central ni el cliente de transacciones.
2. **Cero Consultas SQL:** No existen comandos `SELECT`, `INSERT`, `UPDATE` o `DELETE` asociados al transporte del puente.
3. **Cero Dependencia de Tablas de Auditoría:** Las incidencias y errores de entrega no se almacenan en tablas de base de datos (`audit_logs` no interviene); se dirigen al registrador estructurado de `stderr`.

---

## 3. Estructuras de Memoria y Ciclo de Vida

El cliente mantiene su estado exclusivamente a través de los siguientes miembros en memoria (`discord-bridge.client.ts:63-80`):

### 3.1 Cola FIFO de Mensajes (`this.queue`)
- **Tipo**: `QueueItem[]`
- **Definición de Elemento** (`discord-bridge.client.ts:30-37`):
  ```typescript
  export interface QueueItem {
    id: string;
    frame: BridgeSuggestionCreatedFrame;
    totalRetryElapsedMs: number;
    resolve: () => void;
    reject: (error: Error) => void;
    onRetrying?: ((nextRetryInSeconds: number) => void) | undefined;
  }
  ```
- **Comportamiento**:
  - Inserción al final de la cola mediante `this.queue.push(item)`.
  - Extracción desde la cabeza mediante `this.queue.shift()` únicamente cuando la Fase 1 se confirma (`QUEUED`) o cuando expira el tiempo límite acumulativo por rate limit (5 minutos).

### 3.2 Bloqueo de Fase 1 (`this.pendingPhase1`)
- **Tipo**: `PendingPhase1 | null`
- **Definición** (`discord-bridge.client.ts:39-43`):
  ```typescript
  interface PendingPhase1 {
    id: string;
    resolve: () => void;
    reject: (err: Error) => void;
  }
  ```
- **Función**: Almacena las funciones de resolución o rechazo de la promesa bloqueante de la Fase 1 mientras se espera la trama `QUEUED` del servidor remoto. Si el socket se desconecta abruptamente durante la espera, `handleSocketDisconnect(err)` invoca `pending.reject(err)` liberando la memoria y desbloqueando el pipeline (`discord-bridge.client.ts:627`).

---

## 4. Gestión y Aislamiento de Sockets Efímeros

El módulo diferencia estrictamente dos tipos de sockets en memoria:

| Tipo de Socket | Ámbito y Ciclo de Vida | Propósito | Limpieza de Memoria |
|---|---|---|---|
| **Socket de Trabajo (`this.ws`)** | Instanciado bajo demanda en `ensureConnected()`. Se mantiene activo mientras exista tráfico continuo. | Despacho de la cola secuencial y recepción de eventos de negocio en Fase 2. | Se cierra y libera mediante `socket.close(1000)` al alcanzar 30 minutos de inactividad, o al invocar `close()`. |
| **Socket de Diagnóstico (`probeWs`)** | Instanciado dentro de `checkHealth()`. Estrictamente efímero e independiente. | Sonda de salud HTTP de `GET /api/v1/bridge/health`. | Se destruye y cierra con código `1000` inmediatamente tras recibir `LOGIN_SUCCESS`, o al expirar el timeout duro de 5 s. |

---

## 5. Prevención de Fugas de Memoria (*Memory Leaks*)

Para garantizar la estabilidad del servicio bajo alta carga:
1. **Limpieza de Temporizadores:** Los temporizadores de conexión (`connectTimeout`), de inactividad (`idleTimeout`) y de sondeo de salud (`healthProbeTimeout`) son cancelados explícitamente con `clearTimeout()` tan pronto concluye la operación correspondiente o ante desconexión.
2. **Desacoplamiento de Eventos:** El router y los servicios no acumulan escuchadores de eventos anónimos no acotados; las suscripciones a eventos de tramas tardías (`frame:sending`, `frame:retrying`, `SUGGESTION_CONFIRMED`) se gestionan mediante listeners únicos registrados durante la inicialización del servicio.
3. **Método de Destrucción Limpia (`close`)**: El método público `close()` (`discord-bridge.client.ts:285-306`) cancela todos los temporizadores pendientes, rechaza las promesas de la cola con `Error('Client is closing')`, limpia la cola (`this.queue = []`), y cierra el WebSocket con código normal `1000`.
