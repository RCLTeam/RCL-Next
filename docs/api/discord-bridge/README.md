# Módulo API: Discord Gateway Bridge

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: API Suggestions ➡️](../../../docs/api/suggestions/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/discord-bridge/` implementa el cliente de transporte WebSocket bidireccional entre el servidor de aplicaciones RCL-Next y el bot externo de Discord. Actúa como canal de comunicación multiplexado y encolado en memoria para la ingesta y transmisión asíncrona de eventos hacia la comunidad de Discord (incluyendo el envío de propuestas desde el buzón de sugerencias).

A diferencia de clientes de pasarela convencionales, este componente no mantiene conexiones permanentes inactivas ni bucles de reintento indefinidos. Su arquitectura se fundamenta en cuatro garantías técnicas de bajo nivel:
1. **Conexión bajo demanda (*Lazy Connection*):** El socket WebSocket se instancia únicamente cuando existe tráfico pendiente en la cola o ante una sonda explícita de salud (`ensureConnected()`, `discord-bridge.client.ts:308-326`).
2. **Desconexión por Inactividad:** Si transcurren 30 minutos sin tráfico (`idleTimeoutMs = 30 * 60 * 1000`), el socket se cierra de manera limpia con el código estándar `1000` (`discord-bridge.client.ts:606-622`).
3. **Protocolo en Dos Fases con Amortiguación FIFO:** La transmisión de frames implementa una Fase 1 síncrona (bloqueo hasta recibir confirmación `QUEUED` del bot) y una Fase 2 reactiva asíncrona basada en eventos (`SUGGESTION_CONFIRMED`, `SUGGESTION_FAILED`).
4. **Pausa Anti-Avalancha y Límite Acumulativo de Rate Limit:** La recepción de errores de tasa (`RATE_LIMITED`) pausa temporalmente la cola durante el intervalo indicado por el servidor remoto (`retry_after_seconds`), descartando la operación y emitiendo un identificador de incidente forense `[INCIDENT <uuid>]` a `stderr` si los reintentos superan un umbral acumulativo de 5 minutos (`BridgeRateLimitTimeoutError`, `discord-bridge.client.ts:527-566`).

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Sonda de Salud** | [routes.md](routes.md) | Endpoint `GET /api/v1/bridge/health`, cabeceras `no-store`, sonda efímera `checkHealth()` con timeout duro de 5s y respuestas HTTP 200/503. |
| **Ciclo de Vida y Procesamiento** | [processing.md](processing.md) | Conexión lazy, autenticación `LOGIN` con supertoken, protocolo en 2 fases, pausa por rate limit, timeout de 5m e inactividad de 30m (código 1000). |
| **Persistencia y Memoria** | [persistence.md](persistence.md) | Arquitectura 100% en memoria en proceso Node.js, cola FIFO `QueueItem[]`, cero interacción con PostgreSQL/Drizzle y aislamiento de sockets efímeros. |
| **Validación y Errores** | [validation.md](validation.md) | Verificación de frames salientes, tolerancia ante frames JSON corruptos, discriminación de códigos de error y catálogo de excepciones. |
| **Contratos y DTOs** | [contracts.md](contracts.md) | Esquemas de tramas del protocolo WebSocket (`@rcl/contracts/discord-bridge`), payloads de login, acuse de recibo y contrato `BridgeHealthResponse`. |

---

## 3. Garantías de Fiabilidad y Aislamiento

- **Cero Persistencia Relacional:** El puente no consulta ni modifica tablas en PostgreSQL ni en esquemas Drizzle. Toda la cola y las promesas en vuelo residen exclusivamente en memoria volátil.
- **Aislamiento de Diagnóstico:** La sonda de comprobación de salud (`checkHealth()`) instancia un socket efímero independiente y aislado, garantizando que el diagnóstico no interfiera con los elementos en cola ni comparta el estado de autenticación del socket principal de trabajo.
- **Trazabilidad Forense:** Toda falla de entrega definitiva o agotamiento de reintentos por rate limit genera un identificador único UUID (`crypto.randomUUID()`) emitido a `stderr` bajo el patrón canónico `[INCIDENT <uuid>]`.
