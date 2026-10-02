# Lógica de Procesamiento y Criptografía: Authentication Engine

[⬅️ Volver a Rutas y Transporte](routes.md) | [Siguiente: Persistencia Relacional ➡️](persistence.md)

---

## 1. Ciclo de Vida y Constantes Temporales

La lógica de negocio de autenticación se implementa en la clase `AuthService` (`apps/api/src/modules/auth/auth.service.ts:13-72`), totalmente agnóstica del framework HTTP Express.

El servicio define dos constantes inmutables de ciclo de vida (`auth.service.ts:7-8`):
- `STATE_LIFETIME_MS = 10 * 60 * 1000` (10 minutos / 600.000 ms): Ventana máxima concedida al usuario para completar la pantalla de consentimiento de Discord. Si el usuario tarda más de 10 minutos, el estado se invalida y es rechazado.
- `SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000` (7 días / 604.800.000 ms): Duración de una sesión autenticada activa. Cumplido este periodo, las consultas a la base de datos consideran la sesión caducada (`expires_at <= now`).

---

## 2. Flujo Completo del Protocolo OAuth2

```
Usuario / Navegador          Servidor API (RCL-Next)             Discord OAuth2 API
       |                                |                                |
       |--- 1. GET /auth/discord ------>|                                |
       |                                |-- 2. Purga caducados           |
       |                                |-- 3. Genera randomBytes(32)    |
       |                                |-- 4. Guarda SHA-256 en BD      |
       |<-- 5. 302 + Cookie Estado -----|                                |
       |                                                                 |
       |--- 6. Redirección al diálogo de autorización de Discord ------->|
       |<-- 7. Redirección 302 al callback con ?code=...&state=... ------|
       |                                                                 |
       |--- 8. GET /auth/discord/callback?code=...&state=... ----------->|
       |       (con Cookie Estado)      |-- 9. Borra Cookie Estado       |
       |                                |-- 10. timingSafeEqual(state)   |
       |                                |-- 11. Consume estado en BD     |
       |                                |-- 12. POST /oauth2/token ----->|
       |                                |<-- 13. { access_token } -------|
       |                                |-- 14. GET /users/@me --------->|
       |                                |<-- 15. { id, username, ... } --|
       |                                |-- 16. Upsert discord_users     |
       |                                |-- 17. Inserta auth_sessions    |
       |<-- 18. 302 + Cookie Sesión ----|                                |
```

---

## 3. Seguridad Criptográfica y Defensas Adversariales

### 3.1 Criptografía en Reposo (Tokens Hasheados)

Los identificadores de sesión y de estado intercambiados con el navegador son generados por el generador de números pseudoaleatorios criptográficamente seguro del sistema operativo (`crypto.randomBytes(32).toString('hex')`, `auth.service.ts:23, 51`). Esto produce una cadena hexadecimal de 64 caracteres (256 bits de entropía).

Todos los tokens se validan formalmente mediante la función de guardia de tipos (`auth.service.ts:9-10`):
```typescript
const validToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
```

**Regla de Oro en Reposo:**
En PostgreSQL **jamás** se almacenan los tokens en claro. La función de resumen criptográfico (`auth.service.ts:11`):
```typescript
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
```
calcula el resumen SHA-256 antes de cualquier consulta de inserción, búsqueda o eliminación en las tablas `oauth_states` y `auth_sessions`. Si la base de datos sufriera una exfiltración o volcado no autorizado, ningún atacante podría utilizar los hashes almacenados para suplantar sesiones de usuario activas.

---

### 3.2 Validación Adversarial de Estados OAuth (`validateState`)

Para mitigar ataques de falsificación de petición en sitios cruzados (CSRF) y ataques de canal lateral por análisis de tiempo (*timing attacks*), `validateState` (`auth.service.ts:28-47`) ejecuta una secuencia estricta de 7 barreras defensivas:

```typescript
async validateState(state: unknown, cookie: string | undefined) {
  const stateBuf = typeof state === 'string' ? Buffer.from(state) : null;
  const cookieBuf = typeof cookie === 'string' ? Buffer.from(cookie) : null;

  if (
    !validToken(state) ||
    !validToken(cookie) ||
    !stateBuf ||
    !cookieBuf ||
    stateBuf.length !== cookieBuf.length ||
    !timingSafeEqual(stateBuf, cookieBuf) ||
    !(await this.repository.consumeState(hash(state), new Date()))
  ) {
    throw new AppError(
      400,
      'INVALID_OAUTH_STATE',
      'Sign-in expired or is invalid. Please start again.'
    );
  }
}
```

#### Análisis de las Barreras:
1. **Comprobación de Tipo y Formato (`validToken`):** Verifica que tanto el `state` de la URL como el de la cookie cumplan con la expresión regular `/^[a-f0-9]{64}$/`. Bloquea cadenas nulas, vacías o inyecciones con longitudes anómalas.
2. **Conversión a Buffer Binario:** Se instancian `stateBuf` y `cookieBuf` como `Buffer` de Node.js.
3. **Verificación Estricta de Longitud:** La comprobación `stateBuf.length !== cookieBuf.length` es crucial. La función `crypto.timingSafeEqual` de Node.js arroja una excepción `RangeError` no controlada si los dos búferes tienen longitudes distintas. Esta guarda evita que entradas malformadas provoquen un error HTTP 500 no capturado.
4. **Comparación en Tiempo Constante (`timingSafeEqual`):** Compara los búferes byte a byte garantizando que el tiempo de ejecución no varíe en función del número de bytes coincidentes, neutralizando cualquier análisis estadístico de latencia.
5. **Consumo Atómico de Uso Único:** `repository.consumeState(hash(state), new Date())` borra el registro de `oauth_states` en una única transacción de base de datos (`postgres-auth.repository.ts:14-20`). Si la tupla no existía, había expirado o ya había sido consumida por una petición concurrente, devuelve `false` y se deniega el acceso.

---

### 3.3 Inicio de Sesión y Rotación (`login`)

Al validar satisfactoriamente el estado y recibir el código de Discord, `login` (`auth.service.ts:49-59`) realiza:
1. Intercambio de código por token de acceso y perfil mediante `this.discord.exchangeCode(code)`.
2. Generación de un nuevo token de sesión de 32 bytes (`randomBytes(32).toString('hex')`).
3. Creación atómica de sesión en PostgreSQL con expiración en `Date.now() + SESSION_LIFETIME_MS` (7 días).
4. **Rotación de Sesión:** Si el navegador ya contenía una sesión previa (`previousSession`), se calcula su hash y se elimina dentro de la misma transacción en `postgres-auth.repository.ts:42-43`, impidiendo sesiones huérfanas en re-autenticaciones sucesivas.

---

### 3.4 Sanitización Absoluta de Fallos de Discord (`DiscordOAuthClient`)

La integración con la API REST de Discord (`apps/api/src/modules/auth/discord.client.ts:24-75`) aplica medidas estrictas de aislamiento:
- **Tiempos Límite (*Timeouts*) Defensivos:** Tanto la llamada a `/api/oauth2/token` (`discord.client.ts:54`) como la consulta a `/api/v10/users/@me` (`discord.client.ts:60`) incorporan `signal: AbortSignal.timeout(10000)` (10 segundos). Peticiones colgadas a Discord no degradan el pool de conexiones de la API.
- **Validación de Esquema con Zod:** Las respuestas de Discord se validan con `tokenSchema` (`discord.client.ts:16`) y `profileSchema` (`discord.client.ts:17-22`).
- **Sanitización de Errores y Fugas de Secretos:**
  ```typescript
  } catch {
    // Never leak the provider response, code, client secret or access token.
    throw new AppError(502, 'DISCORD_UNAVAILABLE', 'Discord sign-in failed. Please try again.');
  }
  ```
  Cualquier excepción de red, código HTTP 400/401/429/500 de Discord o error de validación de esquema es capturado en un bloque `catch` que lanza un error canónico 502 `DISCORD_UNAVAILABLE`. Esto garantiza que los detalles de la infraestructura externa, credenciales (`client_secret`), códigos OAuth temporales o tokens de acceso de Discord jamás se filtren en trazas de depuración o respuestas de error hacia el cliente.
