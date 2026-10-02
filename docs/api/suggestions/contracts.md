# Contratos y DTOs del Módulo de Sugerencias

[⬅️ Volver a API Suggestions](README.md) | [Siguiente: Web Suggestions ➡️](../../web/suggestions/README.md)

---

## 1. Visión General

Los contratos TypeScript compartidos para el buzón de sugerencias se encuentran ubicados en el paquete `@rcl/contracts` (`packages/contracts/src/suggestions.ts`).

Estos tipos definen de manera unificada los contratos de solicitud y respuesta entre el backend Fastify/Express y la aplicación cliente web Next.js/React, eliminando desalineaciones en los nombres de propiedades o discrepancias en los estados posibles.

---

## 2. Definición del Estado de Sugerencias (`SuggestionStatus`)

El ciclo de vida de una propuesta se modela a través de una unión discriminada estricta de cadenas literales:

```typescript
export type SuggestionStatus =
  | 'queued'
  | 'sending'
  | 'processing'
  | 'retrying'
  | 'confirmed'
  | 'failed';
```

### Significado de los Valores
- **`'queued'`**: La propuesta ha sido aceptada por la API HTTP (202 Accepted) y reside en la cola interna en memoria.
- **`'sending'`**: El cliente WebSocket ha extraído el elemento de la cola y lo está transmitiendo físicamente al bot.
- **`'processing'`**: El bot de Discord ha confirmado la ingesta preliminar (Fase 1 completada con acuse `QUEUED`) y está operando en Discord.
- **`'retrying'`**: El bot ha recibido limitación de tasa (*rate limit*) de Discord y se encuentra pausado a la espera de cumplir el tiempo de reintento.
- **`'confirmed'`**: **(Terminal)** La propuesta ha sido publicada con éxito en el canal e hilo correspondiente de Discord.
- **`'failed'`**: **(Terminal)** La propuesta no pudo ser entregada tras agotar reintentos o debido a rechazo del servidor remoto.

---

## 3. DTOs de Creación de Sugerencias (`POST /api/v1/suggestions`)

### 3.1 Petición (`CreateSuggestionRequest`)
Estructura JSON esperada en el cuerpo de la solicitud:

```typescript
export interface CreateSuggestionRequest {
  suggestion: string;
  isAnonymous?: boolean | undefined;
}
```

- **`suggestion`**: Texto descriptivo de la propuesta (string de 10 a 1000 caracteres).
- **`isAnonymous`**: Booleano opcional. Si es `true`, la propuesta se publicará bajo el perfil genérico "Anónimo", ocultando la identidad del usuario que la envía.

### 3.2 Respuesta Inmediata (`CreateSuggestionResponse`)
Estructura JSON emitida con código HTTP **202 Accepted**:

```typescript
export interface CreateSuggestionResponse {
  id: string;
  status: SuggestionStatus;
}
```

- **`id`**: Identificador único UUID asignado a la propuesta para seguimiento posterior.
- **`status`**: Inicializado siempre con el valor literal `'queued'`.

---

## 4. DTOs de Consulta de Estado (`GET /api/v1/suggestions/status/:id`)

### 4.1 Respuesta de Estado (`SuggestionStatusResponse`)
Estructura JSON emitida con código HTTP **200 OK**:

```typescript
export interface SuggestionStatusResponse {
  id: string;
  status: SuggestionStatus;
  nextRetryInSeconds?: number | undefined;
  incidentId?: string | undefined;
  error?: string | undefined;
}
```

- **`id`**: Identificador de la propuesta consultada.
- **`status`**: Estado actual en la máquina de estados.
- **`nextRetryInSeconds`**: (Opcional) Tiempo restante estimado en segundos antes del siguiente intento de retransmisión. Presente únicamente cuando `status === 'retrying'`.
- **`incidentId`**: (Opcional) Identificador UUID del incidente forense emitido a `stderr`. Presente únicamente cuando `status === 'failed'`.
- **`error`**: (Opcional) Mensaje descriptivo del motivo del fallo para diagnóstico o visualización. Presente únicamente cuando `status === 'failed'`.
