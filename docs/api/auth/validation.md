# Validación y Manejo de Errores: Authentication API

[⬅️ Volver a Persistencia Relacional](persistence.md) | [Siguiente: Contratos y DTOs ➡️](contracts.md)

---

## 1. Esquemas Zod y Validaciones Defensivas

El subsistema de autenticación somete todas las entradas externas (parámetros de consulta, respuestas de la API de Discord y cabeceras) a esquemas estrictos de validación antes de procesar cualquier dato.

### 1.1 Identificadores de Discord (Snowflakes)

En `apps/api/src/modules/auth/discord.client.ts:17-22`, los datos de identidad devueltos por Discord se validan con Zod:
```typescript
const profileSchema = z.object({
  id: z.string().regex(/^\d{17,20}$/),
  username: z.string().min(1).max(64),
  global_name: z.string().max(64).nullish(),
  avatar: z.string().max(128).nullish()
});
```
- **Snowflake Regex (`/^\d{17,20}$/`):** Valida que el identificador numérico de Discord posea entre 17 y 20 dígitos decimales, rechazando inyecciones alfanuméricas o identificadores no conformes con las especificaciones de la plataforma Discord.
- **Límites de Longitud:** Impone un tamaño máximo de 64 caracteres en el nombre de usuario y nombre global, y un máximo de 128 caracteres para el hash de avatar.

### 1.2 Tokens de Acceso OAuth2

La respuesta del intercambio de código (`https://discord.com/api/oauth2/token`) se valida mediante `tokenSchema` (`discord.client.ts:16`):
```typescript
const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer')
});
```
Si Discord no devuelve un token con `token_type: "Bearer"`, la respuesta se descarta inmediatamente antes de consultar los datos de usuario.

### 1.3 Tokens Criptográficos Internos

En `apps/api/src/modules/auth/auth.service.ts:9-10`, los tokens de sesión y estados OAuth se validan con la expresión regular:
```typescript
const validToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
```
Cualquier entrada que no sea exactamente una cadena hexadecimal de 64 caracteres en minúscula (32 bytes codificados) es tratada como inválida sin realizar consultas a la base de datos.

### 1.4 Código de Autorización de Discord

En `apps/api/src/modules/auth/auth.router.ts:69-75`:
```typescript
if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 2048) {
  throw new AppError(
    400,
    'INVALID_OAUTH_CODE',
    'Discord authorization code is missing or invalid.'
  );
}
```
Previene ataques de desbordamiento de búfer o inyección de cargas de gran tamaño limitando el código de Discord a un máximo estricto de 2048 caracteres.

### 1.5 Verificación de Origen Confiable (`requireTrustedOrigin`)

En `apps/api/src/modules/auth/auth.router.ts:33-40`:
```typescript
export function requireTrustedOrigin(frontendOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (req.get('Origin') !== frontendOrigin) {
      throw new AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
    }
    next();
  };
}
```
Verifica de forma estricta que la cabecera HTTP `Origin` coincida con el dominio del frontend (`frontendOrigin`). Si la cabecera está ausente o apunta a un dominio no autorizado, la mutación se bloquea de forma preventiva.

---

## 2. Matriz de Códigos de Error HTTP

Todas las anomalías de autenticación devuelven una instancia de `AppError` (`apps/api/src/shared/app-error.ts`), que el manejador de errores de la API formatea como `{ error: { code: string, message: string } }`:

| Código HTTP | Código Canónico (`error.code`) | Mensaje Emitido | Causa Detonante |
|:---:|---|---|---|
| `400 Bad Request` | `INVALID_OAUTH_STATE` | `"Sign-in expired or is invalid. Please start again."` | Estado expirado, formato no hexadecimal, cookie ausente, discrepancia en longitud de búfer o fallo en `timingSafeEqual`. |
| `400 Bad Request` | `DISCORD_ACCESS_DENIED` | `"Discord authorization was not completed."` | Parámetro `error` presente en la query de redirección de Discord (usuario canceló la autorización). |
| `400 Bad Request` | `INVALID_OAUTH_CODE` | `"Discord authorization code is missing or invalid."` | Parámetro `code` ausente, no string o de longitud superior a 2048 caracteres. |
| `401 Unauthorized` | `UNAUTHENTICATED` | `"Sign-in is required."` | Cookie de sesión ausente, token corrupto, o sesión inexistente/caducada en `auth_sessions`. |
| `403 Forbidden` | `FORBIDDEN` | `"Insufficient permissions."` | El usuario autenticado posee un rol inferior al requerido (`viewer` intentando acceder a ruta de `admin`). |
| `403 Forbidden` | `INVALID_ORIGIN` | `"Request origin is not allowed."` | Mutación de sesión (ej. `/logout`) con cabecera `Origin` distinta de `frontendOrigin`. |
| `502 Bad Gateway` | `DISCORD_UNAVAILABLE` | `"Discord sign-in failed. Please try again."` | Fallo de red, timeout (>10s) o respuesta HTTP 4xx/5xx de la API de Discord al solicitar token o perfil. |
