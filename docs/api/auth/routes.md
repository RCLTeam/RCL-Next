# Rutas y Capa de Transporte: Authentication API

[⬅️ Volver a la Documentación del Módulo](README.md) | [Siguiente: Lógica de Procesamiento ➡️](processing.md)

---

## 1. Resumen de la Capa de Transporte

El enrutador de autenticación (`apps/api/src/modules/auth/auth.router.ts:42-88`) se monta bajo el prefijo `/api/v1/auth`. Gestiona el apretón de manos (*handshake*) con el proveedor OAuth2 de Discord, la emisión y revocación de cookies de sesión con atributos de alta seguridad, la resolución del usuario actual y la protección de mutaciones frente a ataques de origen cruzado.

Todas las rutas del módulo inyectan de forma centralizada las cabeceras HTTP defensivas (`auth.router.ts:52-56`):
- `Cache-Control: no-store`: Impide que intermediarios, servidores proxy o cachés de navegador almacenen respuestas con datos de identidad o tokens.
- `Referrer-Policy: no-referrer`: Evita que las cabeceras `Referer` filtren identificadores internos o URLs de retorno hacia dominios de terceros.

---

## 2. Catálogo de Endpoints

### 2.1 Iniciar Flujo OAuth2 de Discord

- **Ruta:** `GET /api/v1/auth/discord`
- **Controlador:** `auth.router.ts:57-61`
- **Autenticación requerida:** Ninguna (pública).
- **Parámetros de entrada:** Ninguno.
- **Cabeceras / Cookies entrantes:**
  - Si el cliente envía una cookie de estado previo (`stateCookie`), el servicio la consume para invalidarla (`auth.router.ts:58`).
- **Comportamiento:**
  1. Invoca `options.service.start(previousState)` para purgar sesiones caducadas y generar un nuevo estado criptográfico aleatorio de 32 bytes (`auth.service.ts:19-26`).
  2. Emite la cookie HTTP con el token de estado en claro y tiempo de expiración de 10 minutos (`maxAge: 600000` ms).
  3. Responde con redirección HTTP 302 hacia la URL de autorización de Discord (`https://discord.com/oauth2/authorize?...`).
- **Códigos de Estado:**
  - `302 Found`: Redirección a Discord con `Location` configurada.
  - `500 Internal Server Error`: Fallo de conexión con la base de datos para almacenar el estado.

---

### 2.2 Callback de Autorización de Discord

- **Ruta:** `GET /api/v1/auth/discord/callback`
- **Controlador:** `auth.router.ts:62-80`
- **Autenticación requerida:** Ninguna (validación por cookie de estado de un solo uso).
- **Parámetros de consulta (Query String):**
  - `state` (*string*): Token de estado devuelto por Discord para mitigar CSRF.
  - `code` (*string*): Código de autorización temporal emitido por Discord (`code.length <= 2048`).
  - `error` (*string, opcional*): Presente si el usuario denegó el acceso o canceló el diálogo en Discord.
- **Cookies entrantes:**
  - `stateCookie` (`__Host-rcl_oauth_state` o `rcl_oauth_state`): Token de estado almacenado en el navegador del usuario.
  - `sessionCookie` (`__Host-rcl_session` o `rcl_session`, opcional): Si existía una sesión previa, se extrae para rotarla e invalidarla en base de datos.
- **Comportamiento:**
  1. Extrae la cookie de estado y la elimina de inmediato del cliente mediante `res.clearCookie(stateCookie, cookieOptions)` (`auth.router.ts:64`).
  2. Valida la coincidencia temporal y criptográfica entre `req.query.state` y la cookie mediante `options.service.validateState(req.query.state, state)` (`auth.router.ts:65`).
  3. Si `req.query.error` está definido, lanza `AppError(400, 'DISCORD_ACCESS_DENIED')`.
  4. Si `req.query.code` no es una cadena válida o excede 2048 caracteres, lanza `AppError(400, 'INVALID_OAUTH_CODE')`.
  5. Ejecuta `options.service.login(req.query.code, previousSession)`: intercambia el código con Discord, obtiene el perfil, actualiza `discord_users`, destruye la sesión anterior e inserta la nueva sesión con expiración de 7 días (`auth.service.ts:49-59`).
  6. Emite la cookie de sesión con `maxAge: 604800000` ms (7 días).
  7. Redirige (HTTP 302) a `options.frontendOrigin` (`auth.router.ts:79`). **Inmunidad a redirección abierta**: el destino es fijo y jamás se lee de query parameters.
- **Códigos de Estado:**
  - `302 Found`: Login exitoso, redirección fija al frontend.
  - `400 Bad Request` (`INVALID_OAUTH_STATE`): El estado OAuth caducó, no coincide con la cookie o no existe en la base de datos.
  - `400 Bad Request` (`DISCORD_ACCESS_DENIED`): El usuario rechazó el consentimiento en Discord.
  - `400 Bad Request` (`INVALID_OAUTH_CODE`): Código de Discord ausente, vacío o corrupto.
  - `502 Bad Gateway` (`DISCORD_UNAVAILABLE`): Fallo de comunicación o rechazo en la API de Discord al intercambiar el código o solicitar el perfil.

---

### 2.3 Obtener Usuario Autenticado Actual

- **Ruta:** `GET /api/v1/auth/me`
- **Controlador:** `auth.router.ts:81`
- **Middleware:** `requireAuth(options)` (`auth.router.ts:22-30`).
- **Cookies requeridas:**
  - Cookie de sesión activa (`__Host-rcl_session` o `rcl_session`).
- **Respuesta (HTTP 200 OK):**
  ```json
  {
    "data": {
      "discordId": "123456789012345678",
      "username": "rebel_player",
      "globalName": "Rebel Player",
      "avatarHash": "a_1234567890abcdef1234567890abcdef",
      "role": "admin"
    }
  }
  ```
- **Códigos de Estado:**
  - `200 OK`: Sesión válida; devuelve el objeto `AuthUser`.
  - `401 Unauthorized` (`UNAUTHENTICATED`): Cookie de sesión ausente, token con formato inválido o sesión expirada/inexistente en base de datos.

---

### 2.4 Cierre de Sesión (Logout)

- **Ruta:** `POST /api/v1/auth/logout`
- **Controlador:** `auth.router.ts:82-86`
- **Middleware:** `requireTrustedOrigin(options.frontendOrigin)` (`auth.router.ts:33-40`).
- **Cabeceras obligatorias:**
  - `Origin`: Debe coincidir exactamente con `options.frontendOrigin`.
- **Cookies requeridas:**
  - Cookie de sesión (`sessionCookie`).
- **Comportamiento:**
  1. Si se presenta un token de formato válido, invoca `service.logout(token)` para eliminar el registro de `auth_sessions` en PostgreSQL (`auth.service.ts:69-71`).
  2. Borra la cookie en el navegador con `res.clearCookie(sessionCookie, cookieOptions)`.
  3. Responde HTTP 204 No Content.
- **Códigos de Estado:**
  - `204 No Content`: Sesión eliminada exitosamente.
  - `403 Forbidden` (`INVALID_ORIGIN`): Cabecera `Origin` ausente o distinta al dominio frontend permitido.

---

## 3. Mecanismos Defensivos en Transporte

### 3.1 Prevención de Cookie Shadowing

La extracción de cookies se efectúa mediante una función artesanal (`auth.router.ts:12-17`):
```typescript
function cookie(req: Request, name: string): string | undefined {
  const entries = (req.headers.cookie ?? '').split(';').map((part) => part.trim());
  const matches = entries.filter((part) => part.startsWith(`${name}=`));
  // Reject ambiguous cookies; only our fixed-format, opaque tokens are accepted.
  return matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
}
```
Si un atacante inyecta una cookie duplicada desde un subdominio menos restringido para intentar sombrear o invalidar la cookie legítima del dominio principal, `matches.length` será mayor a 1 y la función devolverá `undefined`, bloqueando el ataque de inmediato.

### 3.2 Prefijo de Host y Opciones de Cookies

Las cookies se configuran según el entorno de ejecución (`auth.router.ts:19-20, 44-51`):

| Atributo | Entorno Seguro (`secureCookies === true`) | Entorno Local / Desarrollo (`secureCookies === false`) |
|---|---|---|
| **Nombre de Sesión** | `__Host-rcl_session` | `rcl_session` |
| **Nombre de Estado** | `__Host-rcl_oauth_state` | `rcl_oauth_state` |
| `httpOnly` | `true` (Inaccesible para `document.cookie` en JavaScript) | `true` |
| `secure` | `true` (Transmisión exclusiva vía HTTPS) | `false` |
| `sameSite` | `'lax'` (Protección frente a CSRF en navegación de terceros) | `'lax'` |
| `path` | `'/'` (Requisito estricto del prefijo `__Host-`) | `'/'` |

### 3.3 Jerarquía y Control de Acceso (`requireAuth`)

El middleware `requireAuth(options, role?)` (`auth.router.ts:22-30`) implementa las siguientes reglas de evaluación de permisos sobre `res.locals.user`:
```typescript
if (role && user.role !== role && !(role === 'admin' && user.role === 'owner'))
  throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions.');
```
- **Equivalencia de Administración:** Un usuario con rol `'owner'` tiene implícitamente todos los privilegios de un `'admin'`.
- **Restricción de Propiedad:** Un usuario con rol `'admin'` **no** satisface una comprobación que exija explícitamente `'owner'`.
- **Miembros sin privilegios:** Un usuario con rol `'viewer'` es rechazado con HTTP 403 ante cualquier comprobación de rol `'admin'` u `'owner'`.
