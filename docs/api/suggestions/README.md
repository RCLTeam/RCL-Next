# Módulo API: Buzón de Sugerencias Comunitarias

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Web Suggestions ➡️](../../../docs/web/suggestions/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/suggestions/` gestiona el ciclo de vida completo de las propuestas enviadas por los usuarios desde el portal web de RCL-Next para su tramitación, moderación y publicación en los canales comunitarios de Discord.

El diseño del módulo implementa una arquitectura desacoplada y reactiva guiada por cuatro principios fundamentales:
1. **Ingesta Rápida y Despacho Asíncrono:** La API responde de forma inmediata con **HTTP 202 Accepted** (`{ id, status: 'queued' }`) y traslada la tramitación pesada con el bot de Discord a tareas en segundo plano (*background dispatch*), minimizando el tiempo de bloqueo en el cliente HTTP.
2. **Máquina de Estados de 6 Fases:** Cada sugerencia transiciona de forma determinista entre los estados `queued`, `sending`, `processing`, `retrying`, `confirmed` y `failed`.
3. **Persistencia Reactiva en Memoria con TTL:** Las sugerencias no se guardan en tablas relacionales de PostgreSQL; se gestionan mediante el almacén `SuggestionStore` (`Map<string, SuggestionRecord>`) con tiempo de vida (TTL) de 2 horas y barrido automático periódico cada 10 minutos.
4. **Registro Estructurado de Incidentes:** Cualquier error terminal de entrega o descarte por limitación de tasa genera un identificador UUID único emitido a `stderr` bajo el patrón canónico `[INCIDENT <uuid>]` para su investigación operativa. La respuesta pública solo lleva ese `incidentId`, nunca el texto del error.
5. **Envíos limitados y memoria acotada:** Cada cliente tiene un límite de envíos (`429` con `Retry-After`), y el almacén y la cola del puente tienen tamaño máximo (`503`). Sin URL del bot, la ruta responde `503 SUGGESTIONS_NOT_CONFIGURED`.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Endpoints y Control de Acceso** | [routes.md](routes.md) | Endpoints `POST /api/v1/suggestions` (202, 429, 503), `GET /status/:id` (200/404), límite de envíos y `TRUST_PROXY`, validación de cabecera `Origin` (403) y caché `no-store`. |
| **Pipeline y Máquina de Estados** | [processing.md](processing.md) | Despacho en segundo plano, máquina de 6 estados, inmutabilidad de estados terminales, resolución de autoría (real vs anónimo) y suscripción al puente. |
| **Persistencia y Registro Forense** | [persistence.md](persistence.md) | `SuggestionStore` en memoria con tamaño máximo, TTL de 2 horas, barrido activo de 10 minutos con `.unref()`, e `IncidentLogger` hacia `stderr`. |
| **Validaciones y Reglas de Entrada** | [validation.md](validation.md) | Validación imperativa de longitud (10 a 1000 caracteres tras trim), validación de origen contra CSRF y ausencia de esquemas Zod/TypeBox. |
| **Contratos y DTOs** | [contracts.md](contracts.md) | Contratos TypeScript (`@rcl/contracts/suggestions`), unión de estados `SuggestionStatus`, DTOs de creación y esquemas de respuesta de estado. |

---

## 3. Invariantes de Dominio y Seguridad

- **Protección contra Regresión de Estado Terminal:** Una vez que un registro alcanza los estados `'confirmed'` o `'failed'`, ninguna notificación tardía o reintento puede alterar su estado de vuelta a `'processing'` o `'retrying'` (`suggestion.store.ts:110-117`).
- **Anonimización Segura:** Cuando un usuario solicita el envío anónimo (`isAnonymous: true`) o el usuario no está autenticado, la autoría se enmascara completamente con `author_id: '0'`, `author_username: 'Anónimo'` y avatar nulo, impidiendo cualquier filtración de identidad en el frame transmitido a Discord (`suggestions.service.ts:233-240`).
- **Aislamiento de Origen (CSRF):** Si está configurada la variable `frontendOrigin`, cualquier petición con una cabecera `Origin` discrepante o no autorizada es rechazada de inmediato con HTTP 403 `INVALID_ORIGIN` (`suggestions.router.ts:58-63`).
