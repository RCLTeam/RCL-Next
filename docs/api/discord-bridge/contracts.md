# Contratos y Esquemas del Puente Discord

[⬅️ Volver a API Discord Bridge](README.md) | [Siguiente: API Suggestions ➡️](../suggestions/README.md)

---

## 1. Visión General

Los contratos de interfaz y esquemas de datos del puente Discord residen en el paquete compartido `@rcl/contracts` (`packages/contracts/src/discord-bridge.ts`).

Estos tipos definen formalmente el protocolo de señalización entre el servidor backend y el microservicio de Discord, asegurando compatibilidad binaria e interoperabilidad estricta sin discrepancias de nombres ni campos ambiguos.

---

## 2. Contratos de la Sonda de Salud (`GET /api/v1/bridge/health`)

### 2.1 Tipos Base de Estado y Mensaje
```typescript
export type BridgeHealthStatus =
  | 'connected'
  | 'unreachable'
  | 'authentication_failed';

export type BridgeHealthMessage =
  | 'Conexión correcta'
  | 'No se puede llegar a él'
  | 'No se pudo autenticar';
```

### 2.2 DTO de Respuesta (`BridgeHealthResponse`)
```typescript
export interface BridgeHealthResponse {
  status: BridgeHealthStatus;
  healthy: boolean;
  message: BridgeHealthMessage;
  details?: string | undefined;
}
```

- **`status`**: Estado técnico discriminado de la conexión.
- **`healthy`**: Booleano directo consumido por la interfaz de usuario para habilitar o deshabilitar componentes interactivos.
- **`message`**: Cadena amigable y canónica en español para presentación en alertas visuales.
- **`details`**: Información técnica ampliada para diagnóstico de infraestructura (ej. advertencias sobre configuración de variables de entorno).

---

## 3. Tramas de Cliente (Servidor $\rightarrow$ Bot Discord)

Definidas bajo la unión `BridgeClientFrame`:

### 3.1 Trama de Inicio de Sesión (`BridgeLoginFrame`)
Transmitida en el evento `open` del socket durante el handshake:
```typescript
export interface BridgeLoginFrame {
  type: 'LOGIN';
  data: {
    id: string;      // UUID aleatorio de sesión (authId)
    token: string;   // Supertoken de autenticación
  };
}
```

### 3.2 Trama de Propuesta Creada (`BridgeSuggestionCreatedFrame`)
Transmitida en la Fase 1 para solicitar la publicación de una sugerencia comunitaria:
```typescript
export interface BridgeSuggestionPayload {
  author_id?: string | undefined;
  author_username?: string | undefined;
  suggestion: string;
  avatar_url?: string | null | undefined;
  created_at?: string | undefined;
}

export interface BridgeSuggestionCreatedFrame {
  type: 'SUGGESTION_CREATED';
  data: {
    id: string;                         // UUID de la sugerencia
    suggestion?: string | undefined;
    author_id?: string | undefined;
    author_username?: string | undefined;
    author_avatar?: string | null | undefined;
    content?: BridgeSuggestionPayload | undefined;
  };
}
```

---

## 4. Tramas de Servidor (Bot Discord $\rightarrow$ Servidor)

Definidas bajo la unión `BridgeServerFrame`:

### 4.1 Trama de Éxito de Autenticación (`BridgeLoginSuccessFrame`)
Confirma la validez del supertoken y autentica el canal:
```typescript
export interface BridgeLoginSuccessFrame {
  type: 'LOGIN_SUCCESS';
  data: {
    id: string;       // Debe coincidir con el authId enviado en LOGIN
    status: 'ok';
  };
}
```

### 4.2 Trama de Acuse de Encolado (`BridgeQueuedFrame`)
Desbloquea la Fase 1 síncrona en el cliente:
```typescript
export interface BridgeQueuedFrame {
  type: 'QUEUED';
  data: {
    id: string;       // Identificador del elemento aceptado en cola
  };
}
```

### 4.3 Trama de Limitación de Tasa (`BridgeRateLimitErrorFrame`)
Notifica la necesidad de pausar temporalmente la cola:
```typescript
export interface BridgeRateLimitErrorFrame {
  type: 'ERROR';
  data: {
    id?: string | undefined;
    code: 'RATE_LIMITED';
    message?: string | undefined;
    retry_after_seconds: number;   // Segundos de espera impuestos
  };
}
```

### 4.4 Trama de Confirmación de Entrega (`BridgeSuggestionConfirmedFrame`)
Notifica en Fase 2 la publicación efectiva del mensaje e hilo en Discord:
```typescript
export interface BridgeSuggestionConfirmedFrame {
  type: 'SUGGESTION_CONFIRMED';
  data: {
    id: string;
    channel_id: number | string;
    message_id: number | string;
    thread_id?: number | string | undefined;
  };
}
```

### 4.5 Trama de Fallo de Entrega (`BridgeSuggestionFailedFrame`)
Notifica en Fase 2 el rechazo o imposibilidad de publicar la sugerencia:
```typescript
export interface BridgeSuggestionFailedFrame {
  type: 'SUGGESTION_FAILED';
  data: {
    id: string;
    code?: string | undefined;
    message?: string | undefined;
    reason?: string | undefined;
  };
}
```
