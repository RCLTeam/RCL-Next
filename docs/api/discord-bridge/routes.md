# Rutas HTTP y Sonda de Salud del Puente Discord

[⬅️ Volver a API Discord Bridge](README.md) | [Siguiente: Procesamiento ➡️](processing.md)

---

## 1. Visión General

El módulo expone una ruta HTTP de diagnóstico montada en el router Fastify/Express mediante la factoría `createDiscordBridgeRouter()` (`apps/api/src/modules/discord-bridge/discord-bridge.router.ts:13-40`). 

Esta ruta proporciona a los clientes frontend (como `useBridgeHealth`) y a las sondas de infraestructura un mecanismo no invasivo para verificar en tiempo real si el bot externo de Discord se encuentra operativo, accesible por red y autenticado correctamente con el supertoken configurado.

---

## 2. Definición del Endpoint

### `GET /api/v1/bridge/health`
- **Ruta física**: Declarada como `GET /health` en el enrutador hijo (`discord-bridge.router.ts:22`) y prefijada globalmente en `/api/v1/bridge/health`.
- **Método**: `GET`
- **Autenticación**: Pública / Abierta (no requiere cookie de sesión ni permisos de rol).
- **Políticas de Caché**:
  - Middleware obligatorio en `discord-bridge.router.ts:17-20`:
    ```http
    Cache-Control: no-store
    ```
    Garantiza que ningún intermediario HTTP, proxy inverso (YARP/Cloudflare) o navegador almacene en caché el diagnóstico de conectividad.

---

## 3. Comportamiento y Sonda Efímera (`checkHealth`)

Cuando se recibe una petición en `/api/v1/bridge/health`, el router invoca el método `checkHealth()` del cliente (`discord-bridge.client.ts:186-213`).

### 3.0 Sonda compartida y caché
`checkHealth()` no abre una conexión por petición: las llamadas simultáneas comparten la misma sonda (`probeHealth()`), y su resultado se reutiliza durante `healthCacheMs` (5 s por defecto, `DEFAULT_BRIDGE_HEALTH_CACHE_MS`). Así la ruta pública abre como máximo una conexión con el bot por periodo. Con `healthCacheMs: 0` solo se comparte la sonda en curso, sin caché.

### 3.1 Arquitectura de Socket Aislado
Para no comprometer la cola de trabajo ni las transacciones en vuelo, la sonda **no utiliza el socket de producción** de la aplicación:
1. Crea una instancia de WebSocket efímera e independiente mediante `this.wsFactory(this.wsUrl)` (`discord-bridge.client.ts:140-142`).
2. Configura un temporizador estricto de desconexión de 5 segundos (`this.healthProbeTimeoutMs = 5000`, `discord-bridge.client.ts:90, 169-175`).
3. Envía un frame `LOGIN` con un identificador de sonda aleatorio generado en el momento (`probeId = crypto.randomUUID()`, `discord-bridge.client.ts:203-212`).
4. Si el servidor remoto responde con `LOGIN_SUCCESS` para ese `probeId` antes de agotar los 5 segundos, la sonda concluye con éxito, cierra el socket efímero limpiamente con el código de protocolo `1000` y emite una respuesta satisfactoria (`discord-bridge.client.ts:231-237`).

---

## 4. Matriz de Códigos de Respuesta HTTP

| Código HTTP | Condición Técnica | Payload de Respuesta (`BridgeHealthResponse`) |
|---|---|---|
| **`200 OK`** | El socket efímero se conectó, transmitió `LOGIN` y recibió `LOGIN_SUCCESS` en menos de 5 segundos. | `{"status": "connected", "healthy": true, "message": "Conexión correcta"}` |
| **`503 Service Unavailable`** | `wsUrl` no configurada, socket inalcanzable, o fallo de red en la apertura. | `{"status": "unreachable", "healthy": false, "message": "No se puede llegar a él", "details": "El websocket no pudo iniciarse..."}` |
| **`503 Service Unavailable`** | El socket abrió la conexión pero se cerró antes de `LOGIN_SUCCESS`, o expiró el temporizador de 5 segundos tras el `LOGIN`. | `{"status": "authentication_failed", "healthy": false, "message": "No se pudo autenticar", "details": "Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env"}` |
| **`503 Service Unavailable`** | Excepción imprevista no controlada en la ejecución de `checkHealth()`. Capturada por el router (`discord-bridge.router.ts:27-36`). | `{"status": "unreachable", "healthy": false, "message": "No se puede llegar a él", "details": "<error.message>"}` |

---

## 5. Inyección de Dependencias en el Router

La factoría `createDiscordBridgeRouter(options)` (`discord-bridge.router.ts:13`) recibe un único objeto de opciones, lo que desacopla la capa de transporte:
```typescript
export interface BridgeHealthChecker {
  checkHealth(): Promise<BridgeHealthResponse>;
}

export interface DiscordBridgeRouterOptions {
  bridgeClient: Pick<DiscordBridgeClient, 'checkHealth'> | BridgeHealthChecker;
}
```
`app.ts` la monta con `createDiscordBridgeRouter({ bridgeClient })`. La opción `bridgeClient` admite tanto la instancia completa de `DiscordBridgeClient` como implementaciones simuladas (*mocks*) para pruebas unitarias sin levantar sockets físicos (`discord-bridge.client.test.ts`, bloque `createDiscordBridgeRouter HTTP endpoints`). No existe otra forma de llamada: pasar el cliente directamente, sin el objeto, no compila.
